use anchor_lang::prelude::*;
use precise_number::Number;

use super::common::PersonalRewarderState;

/// PersonalRewarderCp represents a personal rewarder for a Constant Product LP token account
/// This earns the RAY from the pool_gauge, and distributes it to the owner
#[account]
pub struct PersonalRewarderCp {
    /// owner address
    pub owner: Pubkey,

    /// Link to pool gauge record
    pub pool_gauge: Pubkey,

    pub rewarder: PersonalRewarderState,
}

impl PersonalRewarderCp {
    pub const SIZE: usize =
        // discriminator
        8 +
        // owner
        32 +
        // pool_gauge
        32 +
        // rewarder
        PersonalRewarderState::SIZE;

    pub fn collect(&mut self) -> u64 {
        self.rewarder.collect()
    }

    /// Sync the local index with the gauge index and stage the uncollected rewards
    pub fn sync_and_stage(
        &mut self,
        now: u64,
        gauge_total_ray_emitted: u64,
        earned_time_units: Number,
    ) -> u64 {
        self.rewarder
            .sync_and_stage(now, gauge_total_ray_emitted, earned_time_units)
    }
}
