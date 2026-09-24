use crate::state::NumberRaw;
use anchor_lang::prelude::*;
use precise_number::Number;

/// The specific gauge for a pool
#[account]
pub struct Gauge {
    /// The pool id that this gauge is connected to
    /// This can be a Constant Product pool or a Concentrated Liquidity pool
    pub pool_id: Pubkey,

    /// Total votes in this gauge
    pub total_votes: u64,

    /// The snapshot of the global index when the pool was last updated
    pub last_seen_global_index: NumberRaw,

    /// Lifetime total RAY emitted by this gauge
    pub total_ray_emitted: u64,
}

impl Gauge {
    pub const SIZE: usize =
        // discriminator
        8 +
        // pool_id
        32 +
        // total_votes
        8 +
        // last_seen_global_index
        NumberRaw::SIZE +
        // total_ray_emitted
        8;

    /// Update the amount of RAY emitted from this gauge
    ///
    /// # Arguments
    ///
    /// * `global_index` - The global index for all gauges, distributing RAY
    pub fn update_index(&mut self, global_index: Number) {
        assert!(
            global_index >= self.last_seen_global_index.into(),
            "local index greater than global index"
        );

        let delta = global_index - self.last_seen_global_index.into();

        // the amount of RAY received by the gauge is the total votes on the gauge multiplied by the index delta
        let ray_distributed = delta * Number::from_natural_u64(self.total_votes);

        self.total_ray_emitted += ray_distributed.floor_u64();
        self.last_seen_global_index = global_index.into();
    }

    pub fn change_votes(&mut self, votes: i64) {
        let is_inc = votes > 0;
        let votes = votes.abs() as u64;

        if is_inc {
            self.inc_votes(votes);
        } else {
            self.dec_votes(votes);
        }
    }

    fn inc_votes(&mut self, votes: u64) {
        self.total_votes = self
            .total_votes
            .checked_add(votes)
            .expect("gauge inc votes overflow");
    }

    fn dec_votes(&mut self, votes: u64) {
        self.total_votes = self
            .total_votes
            .checked_sub(votes)
            .expect("gauge dec votes underflow");
    }
}
