use anchor_lang::prelude::*;

use crate::{
    pda::PERSONAL_GAUGE_SEED,
    state::{Gauge, PersonalGauge},
};

#[derive(Accounts)]
pub struct InitPersonalGauge<'info> {
    #[account(mut)]
    pub fee_payer: Signer<'info>,

    /// CHECK: a personal gauge can be created permissionlessly
    pub owner: UncheckedAccount<'info>,

    pub pool_gauge: Account<'info, Gauge>,

    #[account(
        init,
        payer = fee_payer,
        seeds = [
            PERSONAL_GAUGE_SEED.as_bytes(),
            pool_gauge.key().as_ref(),
            owner.key.as_ref(),
        ],
        space = PersonalGauge::SIZE,
        bump
    )]
    pub personal_gauge: Account<'info, PersonalGauge>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitPersonalGauge>) -> Result<()> {
    ctx.accounts.personal_gauge.pool_gauge = ctx.accounts.pool_gauge.key();
    ctx.accounts.personal_gauge.owner = ctx.accounts.owner.key();

    Ok(())
}
