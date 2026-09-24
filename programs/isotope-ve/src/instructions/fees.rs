use crate::{error::VeError, state::*, CONFIG_SEED, GAUGE_EPOCH_SEED, GAUGE_SEED};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

#[derive(Accounts)]
pub struct DepositFees<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, VeConfig>>,
    #[account(mut, seeds = [GAUGE_SEED, gauge.collection.as_ref()], bump = gauge.bump, has_one = quote_mint, has_one = vault)]
    pub gauge: Box<Account<'info, Gauge>>,
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(init_if_needed, payer = depositor, space = 8 + GaugeEpoch::INIT_SPACE, seeds = [GAUGE_EPOCH_SEED, gauge.key().as_ref(), &config.current_epoch(Clock::get()?.unix_timestamp)?.to_le_bytes()], bump)]
    pub gauge_epoch: Box<Account<'info, GaugeEpoch>>,
    #[account(mut)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = quote_mint, token::authority = depositor)]
    pub source: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn deposit_fees(ctx: Context<DepositFees>, amount: u64) -> Result<()> {
    require_gt!(amount, 0, VeError::Zero);
    let epoch = ctx.accounts.config.current_epoch(Clock::get()?.unix_timestamp)?;
    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            TransferChecked { from: ctx.accounts.source.to_account_info(), mint: ctx.accounts.quote_mint.to_account_info(), to: ctx.accounts.vault.to_account_info(), authority: ctx.accounts.depositor.to_account_info() },
        ),
        amount,
        ctx.accounts.quote_mint.decimals,
    )?;
    credit_epoch(&mut ctx.accounts.gauge_epoch, ctx.bumps.gauge_epoch, ctx.accounts.gauge.key(), epoch, amount)?;
    let g = &mut ctx.accounts.gauge;
    g.lifetime_fees = g.lifetime_fees.saturating_add(amount);
    Ok(())
}

pub fn credit_epoch(ge: &mut GaugeEpoch, bump: u8, gauge: Pubkey, epoch: u64, amount: u64) -> Result<()> {
    if ge.gauge == Pubkey::default() {
        ge.bump = bump;
        ge.gauge = gauge;
        ge.epoch = epoch;
    }
    ge.fees = ge.fees.checked_add(amount).ok_or(VeError::Overflow)?;
    Ok(())
}
