use anchor_lang::prelude::*;
use precise_number::Number;

use super::common::PersonalRewarderState;

/// PersonalRewarderCl represents a personal rewarder for a clmm position
/// This earns the RAY from the pool_gauge, and distributes it to the owner
#[account]
pub struct PersonalRewarderCl {
    /// link to the clmm PersonalPositionState record, which is 1:1 with the clmm NFT mint
    pub pool_position: Pubkey,

    /// link to the pool gauge
    pub pool_gauge: Pubkey,

    /// link to the clmm pool
    /// this might not be needed, since the pool_position should find it
    pub pool: Pubkey,

    pub rewarder: PersonalRewarderState,
}

impl PersonalRewarderCl {
    pub const SIZE: usize =
        // Discriminator
        8 +
        // owner
        32 +
        // pool_gauge
        32 +
        // pool
        32 +
        // pool_position
        32 +
        // rewarder
        PersonalRewarderState::SIZE;

    pub fn sync_and_stage(
        &mut self,
        now: u64,
        gauge_total_ray_emitted: u64,
        cur_earned_time_units: Number,
    ) -> u64 {
        self.rewarder
            .sync_and_stage(now, gauge_total_ray_emitted, cur_earned_time_units)
    }

    pub fn collect(&mut self) -> u64 {
        self.rewarder.collect()
    }
}
