use crate::{cpi, error::VeError, state::*, CONFIG_SEED, GAUGE_SEED};
use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, token_interface::{Mint, TokenAccount, TokenInterface}};

#[derive(Accounts)]
pub struct CreateGauge<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, VeConfig>>,
    /// CHECK: cp-swap `TokenCollection`, owned by config.cpmm_program; discriminator checked in handler
    #[account(owner = config.cpmm_program @ VeError::InvalidAccount)]
    pub collection: UncheckedAccount<'info>,
    /// must equal the collection's quote mint
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(init, payer = payer, space = 8 + Gauge::INIT_SPACE, seeds = [GAUGE_SEED, collection.key().as_ref()], bump)]
    pub gauge: Box<Account<'info, Gauge>>,
    #[account(init, payer = payer, associated_token::mint = quote_mint, associated_token::authority = gauge, associated_token::token_program = token_program)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn create_gauge(ctx: Context<CreateGauge>) -> Result<()> {
    {
        let d = ctx.accounts.collection.try_borrow_data()?;
        require!(d.len() >= cpi::COLLECTION_QUOTE_MINT + 32 && d[..8] == cpi::COLLECTION_DISC, VeError::InvalidAccount);
        require_keys_eq!(cpi::pk(&d, cpi::COLLECTION_QUOTE_MINT), ctx.accounts.quote_mint.key(), VeError::InvalidAccount);
    }
    let g = &mut ctx.accounts.gauge;
    g.bump = ctx.bumps.gauge;
    g.collection = ctx.accounts.collection.key();
    g.quote_mint = ctx.accounts.quote_mint.key();
    g.vault = ctx.accounts.vault.key();
    Ok(())
}
