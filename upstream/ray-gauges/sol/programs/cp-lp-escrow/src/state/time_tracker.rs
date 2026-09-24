use anchor_lang::prelude::*;
use precise_number::Number;

use crate::TIME_TRACKER_SEED;

use super::NumberRaw;

#[account]
pub struct TimeTracker {
    /// ID of CPSwap pool
    pub pool_id: Pubkey,

    /// Escrow account for LP tokens
    pub escrow: Pubkey,

    /// Non-decreasing time-unit index
    pub index: NumberRaw,

    /// Total LP tokens deposited
    pub total_lp_deposited: u64,

    /// Last timestamp seen
    pub last_seen_ts: u64,

    pub bump: [u8; 1],
}

impl TimeTracker {
    pub fn new(pool_id: Pubkey, escrow: Pubkey, bump: [u8; 1], last_seen_ts: u64) -> Self {
        Self {
            pool_id,
            escrow,
            index: NumberRaw::default(),
            total_lp_deposited: 0,
            last_seen_ts,
            bump,
        }
    }

    pub const SIZE: usize = 
        // account discriminator
        8 + 
        // pool_id
        32 + 
        // escrow
        32 + 
        // index
        NumberRaw::SIZE + 
        // total_lp_deposited
        8 +
        // last_seen_ts
        8 + 
        // bump
        1; 

    pub fn get_index(&self) -> NumberRaw {
        self.index
    }

    pub fn deposit_lp(&mut self, now: u64, amount: u64) {
        self.update(now);

        self.total_lp_deposited = self
            .total_lp_deposited
            .checked_add(amount)
            .expect("TimeTracker add LP overflow");
    }

    pub fn withdraw_lp(&mut self, now: u64, amount: u64) {
        self.update(now);

        self.total_lp_deposited = self
            .total_lp_deposited
            .checked_sub(amount)
            .expect("TimeTracker sub LP underflow");
    }

    /// Updates the index based on the time passed and the total liquidity
    pub fn update(&mut self, now: u64) {
        assert!(
            self.last_seen_ts <= now,
            "cannot update with older timestamp"
        );
        if self.total_lp_deposited == 0 {
            // update the last seen timestamp anyway, just to be safe
            self.last_seen_ts = now;
            return;
        }
        let delta_t = now - self.last_seen_ts;
        let delta_index = Number::from_ratio(delta_t.into(), self.total_lp_deposited.into());

        let cur_index: Number = self.index.into();
        let new_index = cur_index + delta_index;
        
        self.index = new_index.into();
        self.last_seen_ts = now;
    }

    /// Seeds for deriving the TimeTracker PDA
    /// Used for signing for transfers out of the escrow account
    pub fn seeds(&self) -> [&[u8]; 3] {
        [TIME_TRACKER_SEED, self.pool_id.as_ref(), &self.bump]
    }
}