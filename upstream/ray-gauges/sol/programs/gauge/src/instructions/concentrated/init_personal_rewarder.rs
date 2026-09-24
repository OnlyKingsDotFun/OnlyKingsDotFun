use super::common::get_current_earned_time_units;
use crate::{
    state::{personal_rewarder_cl::PersonalRewarderCl, Gauge, GaugeConfig},
    syncer::{get_now, sync_gauge},
};
use anchor_lang::prelude::*;
use raydium_amm_v3::{
    cpi::{accounts::UpdatePersonalRewards, update_personal_rewards},
    program::RaydiumClmm,
    states::{PersonalPositionState, PoolState},
};

#[derive(Accounts)]
pub struct InitPersonalRewarderCl<'info> {
    /// Permissionless payer for the personal rewarder init
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Global tenant for the gauge program
    /// Must be mutable in order to update itself before initializing the personal rewarder
    #[account(mut)]
    pub gauge_config: Account<'info, GaugeConfig>,

    /// Global pool gauge for the pool
    /// Must be mutable in order to update itself before initializing the personal rewarder
    #[account(
        mut,
        constraint = pool_gauge.pool_id == pool_state.key()
    )]
    pub pool_gauge: Account<'info, Gauge>,

    /// Unique personal liquidity position for the CLMM pool
    /// Must be mutable in order to update itself before initializing the personal rewarder
    #[account(
        mut,
        constraint = personal_liq_position.pool_id == pool_state.key()
    )]
    pub personal_liq_position: Box<Account<'info, PersonalPositionState>>,

    #[account(mut)]
    pub pool_state: AccountLoader<'info, PoolState>,

    #[account(
        init,
        payer = payer,
        space = PersonalRewarderCl::SIZE,
        seeds = [
            b"personal-rewarder-cl".as_ref(),
            personal_liq_position.key().as_ref(),
        ],
        bump
    )]
    pub personal_rewarder: Account<'info, PersonalRewarderCl>,

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

    pub system_program: Program<'info, System>,
}

impl<'info> InitPersonalRewarderCl<'info> {
    fn update_position_rewards(&self) -> UpdatePersonalRewards<'info> {
        UpdatePersonalRewards {
            pool_state: self.pool_state.to_account_info(),
            protocol_position: self.protocol_position.to_account_info(),
            personal_position: self.personal_liq_position.to_account_info(),
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

pub fn handler(ctx: Context<InitPersonalRewarderCl>) -> Result<()> {
    // CPI call to clmm program to update the personal position reward info
    update_personal_rewards(ctx.accounts.update_position_rewards_cpi_ctx())?;
    ctx.accounts.personal_liq_position.reload()?;

    let now = get_now();

    // must sync the gauge before initializing the personal rewarder
    sync_gauge(
        now,
        &mut ctx.accounts.gauge_config,
        &mut ctx.accounts.pool_gauge,
    );

    let cur_earned_time_units = get_current_earned_time_units(
        ctx.accounts.pool_state.load()?,
        &ctx.accounts.personal_liq_position,
    );

    let personal_rewarder = &mut ctx.accounts.personal_rewarder;
    personal_rewarder.pool = ctx.accounts.pool_state.key();
    personal_rewarder.pool_position = ctx.accounts.personal_liq_position.key();
    personal_rewarder.pool_gauge = ctx.accounts.pool_gauge.key();
    personal_rewarder.rewarder.last_updated_ts = now;
    personal_rewarder.rewarder.last_seen_total_emitted_ray =
        ctx.accounts.pool_gauge.total_ray_emitted;
    personal_rewarder.rewarder.last_seen_time_units = cur_earned_time_units.into();

    Ok(())
}
