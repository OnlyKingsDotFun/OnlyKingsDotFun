use super::common::get_current_earned_time_units;
use crate::{
    state::*,
    syncer::{get_now, sync_gauge},
};
use anchor_lang::prelude::*;
use personal_rewarder_cl::PersonalRewarderCl;
use raydium_amm_v3::{
    cpi::{accounts::UpdatePersonalRewards, update_personal_rewards},
    program::RaydiumClmm,
    states::{PersonalPositionState, PoolState},
};

#[derive(Accounts)]
pub struct AccrueRayCl<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut)]
    pub gauge_config: Box<Account<'info, GaugeConfig>>,

    #[account(
        mut,
        has_one = pool_position,
        has_one = pool_gauge
    )]
    pub personal_rewarder: Box<Account<'info, PersonalRewarderCl>>,

    /// CHECK: constrained by the personal rewarder
    #[account(
        mut,
        constraint = pool_gauge.pool_id == pool_state.key()
    )]
    pub pool_gauge: Box<Account<'info, Gauge>>,

    /// CHECK: constrained by the personal rewarder
    #[account(mut)]
    pub pool_position: Box<Account<'info, PersonalPositionState>>,

    /// CHECK: constrained by CPI call to the CLMM program
    #[account(mut)]
    pub pool_state: AccountLoader<'info, PoolState>,

    /// The protocol position for the CLMM program
    /// CHECK: constrained by the CPI call to the CLMM program
    #[account(mut)]
    pub protocol_position: UncheckedAccount<'info>,

    /// CHECK: validated by the CPI call to the CLMM program
    #[account(mut)]
    pub tick_array_lower_loader: UncheckedAccount<'info>,

    /// CHECK: validated by the CPI call to the CLMM program
    #[account(mut)]
    pub tick_array_upper_loader: UncheckedAccount<'info>,

    pub clmm_program: Program<'info, RaydiumClmm>,
}

impl<'info> AccrueRayCl<'info> {
    fn update_position_rewards(&self) -> UpdatePersonalRewards<'info> {
        UpdatePersonalRewards {
            pool_state: self.pool_state.to_account_info(),
            protocol_position: self.protocol_position.to_account_info(),
            personal_position: self.pool_position.to_account_info(),
            tick_array_lower_loader: self.tick_array_lower_loader.to_account_info(),
            tick_array_upper_loader: self.tick_array_upper_loader.to_account_info(),
        }
    }

    fn update_position_rewards_cpi_ctx(
        &self,
    ) -> CpiContext<'_, '_, '_, 'info, UpdatePersonalRewards<'info>> {
        CpiContext::new(
            self.clmm_program.to_account_info(),
            self.update_position_rewards(),
        )
    }
}

pub fn handler(ctx: Context<AccrueRayCl>) -> Result<()> {
    // Ensure that the liq position is fresh
    // CPI call to clmm program to update the personal position reward info
    update_personal_rewards(ctx.accounts.update_position_rewards_cpi_ctx())?;
    // reload the pool_position
    ctx.accounts.pool_position.reload()?;

    let now = get_now();
    sync_gauge(
        now,
        &mut ctx.accounts.gauge_config,
        &mut ctx.accounts.pool_gauge,
    );

    let cur_earned_time_units =
        get_current_earned_time_units(ctx.accounts.pool_state.load()?, &ctx.accounts.pool_position);

    ctx.accounts.personal_rewarder.sync_and_stage(
        now,
        ctx.accounts.pool_gauge.total_ray_emitted,
        cur_earned_time_units,
    );

    Ok(())
}
