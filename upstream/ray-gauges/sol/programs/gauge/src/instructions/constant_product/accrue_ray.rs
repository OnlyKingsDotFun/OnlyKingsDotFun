use crate::{
    state::*,
    syncer::{get_now, sync_gauge},
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct AccrueRay<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut)]
    pub gauge_config: Account<'info, GaugeConfig>,

    #[account(
        mut,
        constraint = personal_rewarder.owner == liq_position.owner,
        has_one = pool_gauge
    )]
    pub personal_rewarder: Account<'info, PersonalRewarderCp>,

    #[account(mut)]
    pub pool_gauge: Account<'info, Gauge>,

    #[account(
        mut,
        has_one = time_tracker
    )]
    pub liq_position: Account<'info, cp_lp_escrow::state::PersonalPosition>,

    #[account(
        mut,
        constraint = pool_gauge.pool_id == time_tracker.pool_id
    )]
    pub time_tracker: Account<'info, cp_lp_escrow::state::TimeTracker>,

    pub cp_lp_escrow_program: Program<'info, cp_lp_escrow::program::CpLpEscrow>,
}

impl<'i> AccrueRay<'i> {
    fn cpi_update_personal_position_accounts(
        &self,
    ) -> cp_lp_escrow::cpi::accounts::UpdatePersonalPosition<'i> {
        cp_lp_escrow::cpi::accounts::UpdatePersonalPosition {
            time_tracker: self.time_tracker.to_account_info(),
            personal_position: self.liq_position.to_account_info(),
        }
    }

    fn do_cpi_update_personal_position(&self) -> Result<()> {
        let cpi_accounts = self.cpi_update_personal_position_accounts();
        let cpi_program = self.cp_lp_escrow_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        cp_lp_escrow::cpi::update_personal_position(cpi_ctx)
    }
}

pub fn handler(ctx: Context<AccrueRay>) -> Result<()> {
    // Ensure that the liq position is fresh
    ctx.accounts.do_cpi_update_personal_position()?;
    ctx.accounts.liq_position.reload()?;

    let now = get_now();

    sync_gauge(
        now,
        &mut ctx.accounts.gauge_config,
        &mut ctx.accounts.pool_gauge,
    );

    ctx.accounts.personal_rewarder.sync_and_stage(
        now,
        ctx.accounts.pool_gauge.total_ray_emitted,
        ctx.accounts.liq_position.earned_time_units.into(),
    );

    Ok(())
}
