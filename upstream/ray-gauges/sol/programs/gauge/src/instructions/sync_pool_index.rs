use crate::{
    state::*,
    syncer::{get_now, sync_gauge},
};
use anchor_lang::prelude::*;

/// Sync the index for the pool, increasing the amount of RAY rewards earned by the pool
#[derive(Accounts)]
pub struct SyncPoolIndex<'info> {
    #[account(mut)]
    pub gauge_config: Account<'info, GaugeConfig>,

    #[account(mut)]
    pub pool_gauge: Account<'info, Gauge>,
}

pub fn handler(ctx: Context<SyncPoolIndex>) -> Result<()> {
    let now = get_now();

    sync_gauge(
        now,
        &mut ctx.accounts.gauge_config,
        &mut ctx.accounts.pool_gauge,
    );

    Ok(())
}
