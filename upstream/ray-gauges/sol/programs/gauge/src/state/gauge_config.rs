use crate::{pda::GLOBAL_CONFIG_SEED, state::NumberRaw};
use anchor_lang::prelude::*;
use precise_number::Number;

const SECONDS_IN_DAY: u64 = 86_400;

/// Global config for all pool connected pool gauges
#[account]
pub struct GaugeConfig {
    /// Global token account hopper for RAY tokens to emit
    pub ray_hopper: Pubkey,

    /// Total RAY emission per day
    pub ray_emission_per_day: u64,

    /// Total votes across all gauges
    pub total_votes: u64,

    /// Global RAY reward index for all gauges
    /// The value of RAY per-vote
    pub index: NumberRaw,

    /// Time since last update
    pub last_updated_ts: u64,

    pub bump: [u8; 1],
}

impl GaugeConfig {
    pub const SIZE: usize =
        // discriminator
        8 +
        // ray_hopper
        32 +
        // ray_emission_per_day
        8 +
        // total_votes
        8 +
        // index
        NumberRaw::SIZE +
        // last_updated_ts
        8 +
        // bump
        1;

    pub fn seeds(&self) -> [&[u8]; 2] {
        [GLOBAL_CONFIG_SEED.as_bytes(), &self.bump]
    }

    /// Update the index to the latest value
    /// Each unit in the index is a "per-vote" share of RAY
    pub fn update_index(&mut self, now: u64) {
        assert!(
            now >= self.last_updated_ts,
            "cannot update with older timestamp"
        );

        let time_elapsed = now - self.last_updated_ts;

        if time_elapsed <= 0 {
            return;
        }

        // If there are no votes on the gauge, return early
        if self.total_votes == 0 {
            self.last_updated_ts = now;
            return;
        }

        // calculate the amount of RAY to emit for the duration
        let time_elapsed: u64 = time_elapsed.try_into().unwrap();
        // duration as a ratio of a day
        let duration_day = Number::from_ratio(time_elapsed.into(), SECONDS_IN_DAY.into());
        // RAY emission
        let ray_emission = Number::from_natural_u64(self.ray_emission_per_day) * duration_day;

        let total_shares = Number::from_natural_u64(self.total_votes);

        // RAY per vote share on gauges
        let ray_per_share = ray_emission / total_shares;

        let cur_index: Number = self.index.into();
        let new_index = cur_index + ray_per_share;

        self.index = new_index.into();
        self.last_updated_ts = now;
    }

    pub fn change_votes(&mut self, amount: i64) {
        let is_inc = amount > 0;
        let amount: u64 = amount.abs().try_into().unwrap();
        if is_inc {
            self.inc_votes(amount)
        } else {
            self.dec_votes(amount)
        }
    }

    fn inc_votes(&mut self, amount: u64) {
        self.total_votes = self
            .total_votes
            .checked_add(amount)
            .expect("total votes overflow");
    }

    fn dec_votes(&mut self, amount: u64) {
        self.total_votes = self
            .total_votes
            .checked_sub(amount)
            .expect("total votes underflow");
    }
}
