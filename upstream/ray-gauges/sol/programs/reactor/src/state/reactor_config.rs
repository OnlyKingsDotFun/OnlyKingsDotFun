use crate::{state::NumberRaw, REACTOR_CONFIG_SEED};
use anchor_lang::prelude::*;
use precise_number::Number;

use super::Rewarder;

const SECONDS_IN_DAY: u64 = 86_400;
const SECONDS_IN_YEAR: u64 = SECONDS_IN_DAY * 365;

#[derive(Default)]
#[account]
pub struct ReactorConfig {
    /// Token account that holds deposited RAY tokens
    pub ray_vault: Pubkey,

    /// Total RAY staked in all Reactors
    /// Tracked separately here to avoid the vulnerability of tokens being sent directly to the vault
    pub total_ray_deposited: u64,

    /// Mint for the RAY token
    pub ray_mint: Pubkey,

    /// Last time rewards were emitted
    pub rewards_emitted_until: u64,

    /// RAY per day
    pub ray_reward_daily_emission: u64,

    /// Token account that holds RAY tokens for emission
    pub ray_reward_hopper: Pubkey,

    /// Increasing share index of RAY rewards
    pub ray_reward_index: NumberRaw,

    /// APR for isoRAY
    pub iso_ray_apr_bps: u16,

    /// isoRAY time-unit index
    pub iso_ray_index: NumberRaw,

    /// Bump seed for the PDA
    pub bump: [u8; 1],
}

impl ReactorConfig {
    pub const LEN: usize =
        // discriminator
        8 +

        // ray_vault
        32 +

        // total_ray_deposited
        8 +

        // ray_mint
        32 +

        // rewards_emitted_until
        8 +

        // ray_reward_daily_emission
        8 +

        // ray_reward_hopper
        32 +

        // ray_reward_index
        NumberRaw::LEN +

        // iso_ray_apr_bps
        2 +

        // iso_ray_index
        NumberRaw::LEN +

        // bump
        1;

    pub fn seeds(&self) -> [&[u8]; 2] {
        [REACTOR_CONFIG_SEED.as_bytes(), &self.bump]
    }

    pub fn deposit_ray(&mut self, amount: u64, current_ts: u64) {
        self.accrue_rewards(current_ts);

        self.total_ray_deposited = self
            .total_ray_deposited
            .checked_add(amount)
            .expect("total ray deposited overflow");
    }

    pub fn withdraw_ray(&mut self, amount: u64, current_ts: u64) {
        self.accrue_rewards(current_ts);

        self.total_ray_deposited = self
            .total_ray_deposited
            .checked_sub(amount)
            .expect("total ray deposited underflow");
    }

    fn accrue_rewards(&mut self, current_ts: u64) {
        if self.rewards_emitted_until >= current_ts {
            msg!("Time has not passed, skipping");
            return;
        }

        let time_elapsed = current_ts - self.rewards_emitted_until;

        self.emit_ray_reward(time_elapsed);
        self.accrue_iso_ray(time_elapsed);

        self.rewards_emitted_until = current_ts;
    }

    /// Emit RAY rewards by increasing the share index
    fn emit_ray_reward(&mut self, time_elapsed: u64) {
        // no need to emit rewards if no time has passed
        if time_elapsed == 0 {
            return;
        }

        // total shares
        let total_shares = self.total_ray_deposited;

        // if there are no shares, no need to increase the share index
        if total_shares == 0 {
            return;
        }

        // duration as a ratio of a day
        let duration_day = Number::from_ratio(time_elapsed.into(), SECONDS_IN_DAY.into());

        // RAY emission
        let ray_emission = Number::from_natural_u64(self.ray_reward_daily_emission) * duration_day;

        let total_shares = Number::from_natural_u64(total_shares);

        // calculate RAY per share
        let ray_per_share_increase = ray_emission / total_shares;

        // increase the share index
        let cur_ray_reward_index: Number = self.ray_reward_index.into();
        let new_ray_reward_index = cur_ray_reward_index + ray_per_share_increase;

        self.ray_reward_index = new_ray_reward_index.into();
    }

    /// Accrue isoRAY for the duration since the last accrual
    /// Increase both:
    /// - total isoRAY in circulation
    /// - isoRAY index (share value of RAY to isoRAY)
    fn accrue_iso_ray(&mut self, time_elapsed: u64) {
        if self.total_ray_deposited == 0 {
            msg!("no ray deposited, skipping accrue");
            return;
        }

        let duration_year = Number::from_ratio(time_elapsed.into(), SECONDS_IN_YEAR.into());
        let iso_ray_apr = Number::from_bps(self.iso_ray_apr_bps);

        let partial_rate = duration_year * iso_ray_apr;

        self.iso_ray_index += partial_rate;
    }
}

impl Rewarder for ReactorConfig {
    fn ray_reward_index(&self) -> Number {
        self.ray_reward_index.into()
    }

    fn iso_ray_index(&self) -> Number {
        self.iso_ray_index.into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_emit_ray_reward() {
        let mut reactor_config = ReactorConfig::default();
        reactor_config.ray_reward_daily_emission = 100_000;

        // 0 RAY deposited, 0 time elapsed
        reactor_config.emit_ray_reward(0);
        assert_eq!(Number::ZERO, reactor_config.ray_reward_index.into());

        // 0 RAY deposited, 1 day elapsed
        reactor_config.emit_ray_reward(SECONDS_IN_DAY);
        assert_eq!(Number::ZERO, reactor_config.ray_reward_index.into());

        // 1 RAY deposited, 1 day elapsed
        // With 100_000 RAY daily emission, the share index should be 100_000
        reactor_config.total_ray_deposited = 1;
        reactor_config.emit_ray_reward(SECONDS_IN_DAY);
        assert_eq!(
            Number::from_natural_u64(100_000),
            reactor_config.ray_reward_index.into()
        );

        // now with 2 RAY deposited, the share index should increase by 50_000
        reactor_config.total_ray_deposited = 2;
        reactor_config.emit_ray_reward(SECONDS_IN_DAY);
        assert_eq!(
            Number::from_natural_u64(150_000),
            reactor_config.ray_reward_index.into()
        );
    }

    #[test]
    fn test_accrue_iso_ray() {
        let mut reactor_config = ReactorConfig::default();
        // 50% APR
        reactor_config.iso_ray_apr_bps = 50_00;

        // 0 RAY deposited, 0 time elapsed
        reactor_config.accrue_iso_ray(0);
        assert_eq!(Number::ZERO, reactor_config.iso_ray_index.into());

        // 1 RAY deposited, 0 time elapsed
        reactor_config.total_ray_deposited = 1;
        reactor_config.accrue_iso_ray(0);
        assert_eq!(Number::ZERO, reactor_config.iso_ray_index.into());

        // 1 RAY deposited, 1 year elapsed
        // With 50% APR, the isoRAY index should be 0.5 -- or 0.5 isoRAY per RAY
        reactor_config.accrue_iso_ray(SECONDS_IN_YEAR);
        assert_eq!(
            Number::from_ratio(1, 2),
            reactor_config.iso_ray_index.into()
        );

        // 2 RAY deposited, 1 year elapsed
        // After 1 year, 1 full isoRAY should be minted
        // This is 1 isoRAY divided by 2 RAY, or 0.5 isoRAY per RAY
        reactor_config.total_ray_deposited = 2;
        reactor_config.accrue_iso_ray(SECONDS_IN_YEAR);
        assert_eq!(Number::ONE, reactor_config.iso_ray_index.into());
    }
}
