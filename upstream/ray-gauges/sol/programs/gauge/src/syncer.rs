use anchor_lang::prelude::*;

use crate::state::{Gauge, GaugeConfig};

pub fn get_now() -> u64 {
    Clock::get().unwrap().unix_timestamp as u64
}

/// Sync the gauge index with the gauge config index
pub fn sync_gauge<'i>(now: u64, gauge_config: &mut GaugeConfig, gauge: &mut Gauge) {
    gauge_config.update_index(now);
    gauge.update_index(gauge_config.index.into());
}
