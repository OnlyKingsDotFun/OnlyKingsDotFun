use anchor_lang::prelude::*;
use precise_number::Number;

use crate::state::NumberRaw;

#[account]
pub struct PersonalPosition {
    pub owner: Pubkey,

    /// Amount of liquidity
    amount: u64,

    /// Link to time tracker
    pub time_tracker: Pubkey,

    pub last_seen_index: NumberRaw,

    /// High-precision number representation of earned units
    pub earned_time_units: NumberRaw,
}

impl PersonalPosition {
    pub const SIZE: usize =
        // account discriminator
        8 +
        // owner
        32 +
        // amount
        8 +
        // time_tracker
        32 +
        // last_seen_index
        NumberRaw::SIZE +
        // earned_time_units
        NumberRaw::SIZE;

    /// Increase amount of LP tokens in the personal position
    pub fn inc_amount(&mut self, cur_index: Number, amount: u64) {
        // update the earned time units
        self.update(cur_index);

        self.amount = self
            .amount
            .checked_add(amount)
            .expect("personal position overflow");
    }

    /// Decrease amount of LP tokens in the personal position
    pub fn dec_amount(&mut self, cur_index: Number, amount: u64) {
        // update the earned time units
        self.update(cur_index);

        self.amount = self
            .amount
            .checked_sub(amount)
            .expect("personal position underflow");
    }

    /// Update the earned time units
    pub fn update(&mut self, cur_index: Number) {
        assert!(
            cur_index >= self.last_seen_index.into(),
            "index must be non-decreasing"
        );

        let delta_i = cur_index - self.last_seen_index.into();

        if delta_i == Number::ZERO {
            return;
        }

        let earned = Number::from_natural_u64(self.amount) * delta_i;

        let cur_earned_time_units: Number = self.earned_time_units.into();
        let new_earned_time_units = cur_earned_time_units + earned;

        self.earned_time_units = new_earned_time_units.into();
        self.last_seen_index = cur_index.into();
    }
}
