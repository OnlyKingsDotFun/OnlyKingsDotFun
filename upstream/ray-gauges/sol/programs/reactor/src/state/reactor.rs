use anchor_lang::prelude::*;
use precise_number::Number;

use crate::errors::ReactorErrors;

use super::NumberRaw;

#[account]
pub struct Reactor {
    pub owner: Pubkey,

    /// Amount of RAY deposited
    pub ray: u64,

    /// How many votes are locked in gauge voting
    pub locked_votes: u64,

    /// isoRAY balance
    pub iso_ray: u64,

    /// Rewards from simple staking emissions
    pub ray_stake_rewards: RayStakeRewards,

    /// The last seen index for isoRAY accrual
    pub last_seen_index_iso_ray: NumberRaw,
}

#[derive(Default, Clone, Debug, AnchorDeserialize, AnchorSerialize)]
pub struct RayStakeRewards {
    /// Last seen global index
    pub last_seen_index: NumberRaw,
    /// RAY rewards from simple staking
    pub uncollected_ray_reward: u64,
}

impl RayStakeRewards {
    pub const LEN: usize = NumberRaw::LEN + 8;
}

#[derive(Debug)]
pub struct RayWithdrawResult {
    pub iso_ray_slashed: u64,
}

#[derive(Debug)]
pub struct AccrueIsoRayResult {
    pub iso_ray_accrued: u64,
}

pub trait Rewarder {
    fn ray_reward_index(&self) -> Number;
    fn iso_ray_index(&self) -> Number;
}

impl Reactor {
    pub const LEN: usize =
        // dicriminator
        8 +
        // owner
        32 +
        // ray
        8 +
        // locked_votes
        8 +
        // iso_ray
        8 +
        // ray_stake_rewards
        RayStakeRewards::LEN +
        // last_seen_index_iso_ray
        NumberRaw::LEN;

    /// Accrue isoRAY based on the global index
    fn accrue_iso_ray(&mut self, current_iso_ray_index: Number) -> AccrueIsoRayResult {
        assert!(
            current_iso_ray_index >= self.last_seen_index_iso_ray.into(),
            "current index is less than last seen index"
        );

        let delta = current_iso_ray_index - self.last_seen_index_iso_ray.into();
        let iso_ray_accrued = Number::from_natural_u64(self.ray) * delta;
        let iso_ray_accrued = iso_ray_accrued.floor_u64();

        self.iso_ray += iso_ray_accrued;
        self.last_seen_index_iso_ray = current_iso_ray_index.into();

        AccrueIsoRayResult { iso_ray_accrued }
    }

    fn accrue_ray_rewards(&mut self, current_ray_reward_index: Number) {
        let delta = current_ray_reward_index - self.ray_stake_rewards.last_seen_index.into();
        // if there is no delta, there is nothing to accrue
        if delta == Number::ZERO {
            return;
        }

        let ray_rewards_earned = Number::from_natural_u64(self.ray) * delta;
        let ray_rewards_earned = ray_rewards_earned.floor_u64();

        self.ray_stake_rewards.uncollected_ray_reward += ray_rewards_earned;
        self.ray_stake_rewards.last_seen_index = current_ray_reward_index.into();
    }

    /// Deposit RAY into the reactor after accruing isoRAY
    pub fn deposit_ray(
        &mut self,
        amount: u64,
        iso_ray_index: Number,
        ray_reward_index: Number,
    ) -> u64 {
        self.accrue_iso_ray(iso_ray_index);

        self.accrue_ray_rewards(ray_reward_index);

        self.ray = self.ray.checked_add(amount).unwrap();

        self.ray
    }

    /// Withdraw RAY from the reactor
    /// Cannot withdraw more than locked votes
    pub fn withdraw_ray(
        &mut self,
        ray_decrease: u64,
        iso_ray_index: Number,
        ray_reward_index: Number,
    ) -> Result<()> {
        self.accrue_iso_ray(iso_ray_index);

        self.accrue_ray_rewards(ray_reward_index);

        if self.ray < ray_decrease {
            return err!(ReactorErrors::InsufficientRayBalance);
        }

        let iso_ray_decrease = self.calc_iso_ray_slash_amount(ray_decrease);
        let total_vote_decrease = ray_decrease + iso_ray_decrease;

        if self.free_votes() < total_vote_decrease {
            return err!(ReactorErrors::InsufficientVotesToWithdraw);
        }

        self.ray = self.ray.checked_sub(ray_decrease).unwrap();
        self.iso_ray = self.iso_ray.checked_sub(iso_ray_decrease).unwrap();

        Ok(())
    }

    /// Lock votes
    /// Cannot lock more than free votes
    /// Returns the new locked votes amount
    pub fn lock_votes(&mut self, amount: u64) -> Result<u64> {
        if self.free_votes() < amount {
            return err!(ReactorErrors::InsufficientVotesToLock);
        }

        self.locked_votes = self.locked_votes.checked_add(amount).unwrap();

        // redundant check
        assert!(self.locked_votes <= self.vote_power());

        Ok(self.locked_votes)
    }

    /// Unlock votes
    /// Cannot unlock more than locked votes
    /// Returns the new locked votes amount
    pub fn unlock_votes(&mut self, amount: u64) -> Result<u64> {
        if self.locked_votes < amount {
            return err!(ReactorErrors::InsufficientVotesToUnlock);
        }

        self.locked_votes = self.locked_votes.checked_sub(amount).unwrap();

        Ok(self.locked_votes)
    }

    /// Vote power is the sum of RAY and isoRAY
    pub fn vote_power(&self) -> u64 {
        self.ray.checked_add(self.iso_ray).unwrap()
    }

    /// Free votes are the vote power minus locked votes
    pub fn free_votes(&self) -> u64 {
        self.vote_power() - self.locked_votes
    }

    /// Calculate the amount of isoRAY to slash
    fn calc_iso_ray_slash_amount(&self, ray_decrease: u64) -> u64 {
        iso_ray_slash_amount(self.ray, ray_decrease, self.iso_ray)
    }

    /// Zero out and collect the earned RAY rewards
    pub fn collect_ray_rewards(&mut self) -> u64 {
        let ray = self.ray_stake_rewards.uncollected_ray_reward;
        self.ray_stake_rewards.uncollected_ray_reward = 0;
        ray
    }
}

fn iso_ray_slash_ratio(ray_balance: u64, ray_decrease: u64) -> Number {
    if ray_balance == 0 || ray_decrease == 0 {
        Number::from_natural_u64(0)
    } else if ray_balance == ray_decrease {
        Number::from_natural_u64(1)
    } else {
        Number::from_ratio(ray_decrease.into(), ray_balance.into())
    }
}

fn iso_ray_slash_amount(ray_balance: u64, ray_decrease: u64, iso_ray: u64) -> u64 {
    let iso_ray = Number::from_natural_u64(iso_ray);

    // the decrease should ceil
    let iso_ray_decrease = iso_ray_slash_ratio(ray_balance, ray_decrease) * iso_ray;

    // the decrease should be at most the isoRAY balance
    iso_ray_decrease.ceil().min(iso_ray).floor_u64()
}

#[cfg(test)]
mod test_reactor {
    use super::*;

    fn setup_reactor() -> Reactor {
        Reactor {
            owner: Pubkey::new_unique(),
            ray: 0,
            locked_votes: 0,
            iso_ray: 0,
            last_seen_index_iso_ray: Number::ZERO.into(),
            ray_stake_rewards: RayStakeRewards {
                last_seen_index: Number::ZERO.into(),
                uncollected_ray_reward: 0,
            },
        }
    }

    #[test]
    fn test_iso_ray_slash_ratio() {
        let ray_balance = 100;
        let ray_decrease = 50;

        let ratio = iso_ray_slash_ratio(ray_balance, ray_decrease);
        assert_eq!(ratio, Number::from_ratio(1, 2));

        let ray_balance = 360;
        let ray_decrease = 90;
        let ratio = iso_ray_slash_ratio(ray_balance, ray_decrease);
        assert_eq!(ratio, Number::from_ratio(1, 4));
    }

    #[test]
    fn test_iso_ray_full_slash_ratio() {
        let ray_balance = 100;
        let ray_decrease = 100;

        let ratio = iso_ray_slash_ratio(ray_balance, ray_decrease);
        assert_eq!(ratio, Number::ONE);
    }

    #[test]
    fn test_iso_ray_slash_amount() {
        let ray_balance = 100;
        let ray_decrease = 50;
        let iso_ray = 400;

        let amount = iso_ray_slash_amount(ray_balance, ray_decrease, iso_ray);
        assert_eq!(amount, 200);
    }

    #[test]
    fn test_iso_ray_full_slash_amount() {
        let ray_balance = 100;
        let ray_decrease = 100;
        let iso_ray = 400;

        let amount = iso_ray_slash_amount(ray_balance, ray_decrease, iso_ray);
        assert_eq!(amount, 400);

        let iso_ray = 1;
        let amount = iso_ray_slash_amount(ray_balance, ray_decrease, iso_ray);
        assert_eq!(amount, 1);
    }

    #[test]
    fn test_iso_ray_partial_slash() {
        let ray_balance = 100;
        let ray_decrease = 99;
        let iso_ray = 1;

        let amount = iso_ray_slash_amount(ray_balance, ray_decrease, iso_ray);
        assert_eq!(amount, 1);

        let ray_decrease = 50;
        let amount = iso_ray_slash_amount(ray_balance, ray_decrease, iso_ray);
        assert_eq!(amount, 1);

        // it will decrease by 1 even if the ratio is less than 1
        let ray_decrease = 1;
        let amount = iso_ray_slash_amount(ray_balance, ray_decrease, iso_ray);
        assert_eq!(amount, 1);

        // it will decrease by 1 even if the ratio is less than 1
        let ray_decrease = 1;
        let amount = iso_ray_slash_amount(ray_balance, ray_decrease, 2);
        assert_eq!(amount, 1);

        let ray_decrease = 0;
        let amount = iso_ray_slash_amount(ray_balance, ray_decrease, iso_ray);
        assert_eq!(amount, 0);
    }

    #[test]
    fn test_reactor_deposit_ray() {
        let mut reactor = setup_reactor();

        let amount = 100;

        let result = reactor.deposit_ray(amount, Number::ZERO, Number::ZERO);
        assert_eq!(result, amount);
        assert_eq!(reactor.ray, amount);
        assert_eq!(reactor.iso_ray, 0);
    }

    #[test]
    fn test_reactor_withdraw_ray() {
        let mut reactor = setup_reactor();
        reactor.iso_ray = 100;
        reactor.ray = 100;

        let amount = 50;

        reactor
            .withdraw_ray(amount, Number::ZERO, Number::ZERO)
            .unwrap();
        assert_eq!(reactor.ray, 50);
        assert_eq!(reactor.iso_ray, 50);
    }

    #[test]
    fn test_cannot_withdraw_if_insufficient_ray_balance() {
        let mut reactor = setup_reactor();
        reactor.iso_ray = 100;
        reactor.ray = 100;

        let amount = 150;

        let result = reactor.withdraw_ray(amount, Number::ZERO, Number::ZERO);
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err(),
            ReactorErrors::InsufficientRayBalance.into()
        );
    }

    #[test]
    fn test_accrue_iso_ray() {
        let mut reactor = setup_reactor();
        reactor.ray = 100;

        assert_eq!(reactor.iso_ray, 0);
        assert!(Number::ZERO == reactor.last_seen_index_iso_ray.into());

        let current_iso_ray_index = Number::from_natural_u64(2);

        let result = reactor.accrue_iso_ray(current_iso_ray_index);
        assert_eq!(result.iso_ray_accrued, 200);
        assert_eq!(reactor.iso_ray, 200);
    }

    #[test]
    fn test_slash_iso_ray() {
        let mut reactor = setup_reactor();
        reactor.ray = 100;
        reactor.iso_ray = 100;

        let amount = 50;

        let iso_ray_decrease = reactor.calc_iso_ray_slash_amount(amount);
        assert_eq!(iso_ray_decrease, 50);
    }
}
