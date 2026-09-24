use crate::{pda::*, state::*, syncer::get_now};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct InitConstantGauge<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut)]
    pub gauge_config: Account<'info, GaugeConfig>,

    #[account(
        init,
        payer = payer,
        seeds = [
            POOL_GAUGE_SEED.as_bytes(),
            pool_id.key().as_ref(),
        ],
        space = Gauge::SIZE,
        bump
    )]
    pub pool_gauge: Account<'info, Gauge>,

    /// CHECK: does not matter if gauges are created for fake pools
    /// There will not be a CP escrow nor CL position for them anyway
    pub pool_id: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitConstantGauge>) -> Result<()> {
    let now = get_now();
    ctx.accounts.gauge_config.update_index(now);

    let g = &mut ctx.accounts.pool_gauge;

    // initialize the pool gauge with the current global index
    g.last_seen_global_index = ctx.accounts.gauge_config.index;
    g.pool_id = ctx.accounts.pool_id.key();
    g.total_ray_emitted = 0;
    g.total_votes = 0;

    Ok(())
}
