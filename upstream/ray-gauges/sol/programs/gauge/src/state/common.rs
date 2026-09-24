use anchor_lang::prelude::*;
use precise_number::Number;

use super::NumberRaw;

/// Common state for personal rewarders
/// Shared between CP and CL rewarders
#[derive(Default, Clone, AnchorDeserialize, AnchorSerialize)]
pub struct PersonalRewarderState {
    /// High-precision number for last seen earned time units
    pub last_seen_time_units: NumberRaw,

    /// Last seen total RAY emitted
    pub last_seen_total_emitted_ray: u64,

    /// Timestamp of last update
    pub last_updated_ts: u64,

    /// amount of RAY earned by user
    pub staged_ray: u64,
}

impl PersonalRewarderState {
    pub const SIZE: usize =
        // last_seen_time_units
        NumberRaw::SIZE +
        // last_seen_total_emitted_ray
        8 +
        // last_updated_ts
        8 +
        // staged_ray
        8;

    /// Collect earned RAY
    pub fn collect(&mut self) -> u64 {
        let collected = self.staged_ray;
        self.staged_ray = 0;
        collected
    }

    /// Sync the local index with the gauge index and stage the uncollected rewards
    pub fn sync_and_stage(
        &mut self,
        now: u64,
        gauge_total_ray_emitted: u64,
        cur_earned_time_units: Number,
    ) -> u64 {
        assert!(
            gauge_total_ray_emitted >= self.last_seen_total_emitted_ray,
            "gauge index must be greater than last seen index"
        );

        assert!(
            now >= self.last_updated_ts,
            "cannot update with older timestamp"
        );

        assert!(
            cur_earned_time_units >= self.last_seen_time_units.into(),
            "earned time units must be non-decreasing"
        );

        let delta_ray = gauge_total_ray_emitted - self.last_seen_total_emitted_ray;
        let delta_time = now - self.last_updated_ts;
        if delta_time == 0 {
            return 0;
        }

        let delta_units = cur_earned_time_units - self.last_seen_time_units.into();

        // Calc rate of RAY emission since last update
        let ray_rate = Number::from_ratio(delta_ray.into(), delta_time.into());

        // Calc RAY to collect
        let ray_to_collect = ray_rate * delta_units;

        let collected = ray_to_collect.floor_u64();

        self.last_seen_total_emitted_ray = gauge_total_ray_emitted;
        self.last_seen_time_units = cur_earned_time_units.into();
        self.last_updated_ts = now;
        self.staged_ray += collected;

        collected
    }
}
