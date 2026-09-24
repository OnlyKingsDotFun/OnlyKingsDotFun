use crate::{
    pda::*,
    state::*,
    syncer::{get_now, sync_gauge},
};
use anchor_lang::prelude::*;
use common::PersonalRewarderState;

#[derive(Accounts)]
pub struct InitPersonalRewarder<'info> {
    /// This could be permissionless
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(mut)]
    pub gauge_config: Account<'info, GaugeConfig>,

    /// CHECK: constrained by time tracker
    #[account(mut)]
    pub pool_gauge: Account<'info, Gauge>,

    #[account(
        init,
        payer = owner,
        space = PersonalRewarderCp::SIZE,
        seeds = [
            PERSONAL_REWARDER_CP_SEED.as_bytes(),
            pool_gauge.key().as_ref(),
            owner.key().as_ref(),
        ],
        bump
    )]
    pub personal_rewarder: Account<'info, PersonalRewarderCp>,

    #[account(
        mut,
        has_one = owner,
        has_one = time_tracker
    )]
    pub personal_liq_position: Account<'info, cp_lp_escrow::state::PersonalPosition>,

    /// The time tracker must link to the pool gauge
    #[account(
        mut,
        constraint = pool_gauge.pool_id == time_tracker.pool_id
    )]
    pub time_tracker: Account<'info, cp_lp_escrow::state::TimeTracker>,

    pub system_program: Program<'info, System>,

    pub cp_lp_escrow_program: Program<'info, cp_lp_escrow::program::CpLpEscrow>,
}

impl<'i> InitPersonalRewarder<'i> {
    fn cpi_update_personal_position_accounts(
        &self,
    ) -> cp_lp_escrow::cpi::accounts::UpdatePersonalPosition<'i> {
        cp_lp_escrow::cpi::accounts::UpdatePersonalPosition {
            time_tracker: self.time_tracker.to_account_info(),
            personal_position: self.personal_liq_position.to_account_info(),
        }
    }

    fn do_cpi_update_personal_position(&self) -> Result<()> {
        let cpi_accounts = self.cpi_update_personal_position_accounts();
        let cpi_program = self.cp_lp_escrow_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        cp_lp_escrow::cpi::update_personal_position(cpi_ctx)
    }
}

pub fn handler(ctx: Context<InitPersonalRewarder>) -> Result<()> {
    // Ensure that the liq position is fresh
    ctx.accounts.do_cpi_update_personal_position()?;
    ctx.accounts.personal_liq_position.reload()?;

    let now = get_now();
    sync_gauge(
        now,
        &mut ctx.accounts.gauge_config,
        &mut ctx.accounts.pool_gauge,
    );

    let pr = &mut ctx.accounts.personal_rewarder;

    pr.owner = ctx.accounts.owner.key();
    pr.pool_gauge = ctx.accounts.pool_gauge.key();

    let prs = PersonalRewarderState {
        last_seen_time_units: ctx.accounts.personal_liq_position.earned_time_units.into(),
        last_seen_total_emitted_ray: ctx.accounts.pool_gauge.total_ray_emitted,
        last_updated_ts: now,
        staged_ray: 0,
    };
    pr.rewarder = prs;

    Ok(())
}
