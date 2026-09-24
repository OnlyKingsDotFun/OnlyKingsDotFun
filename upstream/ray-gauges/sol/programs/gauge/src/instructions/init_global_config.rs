use crate::{pda::*, state::*, syncer::get_now};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use reactor::ray_mint::ID as RAY_MINT_ID;

#[derive(Accounts)]
pub struct InitGaugeConfig<'info> {
    /// must be admin
    #[account(
        mut,
        address = crate::admin::ID
    )]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = GaugeConfig::SIZE,
        seeds = [
            GLOBAL_CONFIG_SEED.as_bytes(),
        ],
        bump
    )]
    pub gauge_config: Account<'info, GaugeConfig>,

    #[account(
        init,
        payer = payer,
        token::mint = ray_mint,
        token::authority = gauge_config,
        seeds = [
            GLOBAL_RAY_HOPPER_SEED.as_bytes(),
        ],
        bump
    )]
    pub ray_hopper: Account<'info, TokenAccount>,

    #[account(address = RAY_MINT_ID)]
    pub ray_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitGaugeConfig>, ray_emission_per_day: u64) -> Result<()> {
    let gc = &mut ctx.accounts.gauge_config;

    gc.last_updated_ts = get_now();
    gc.ray_emission_per_day = ray_emission_per_day;
    gc.ray_hopper = ctx.accounts.ray_hopper.key();
    gc.bump = [ctx.bumps.gauge_config];

    Ok(())
}
