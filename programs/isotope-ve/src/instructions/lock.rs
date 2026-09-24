use crate::{error::VeError, state::*, CONFIG_SEED, ESCROW_SEED, LOCK_SEED};
use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked}};

fn deposit<'info>(tp: &Interface<'info, TokenInterface>, from: &InterfaceAccount<'info, TokenAccount>, to: &InterfaceAccount<'info, TokenAccount>, mint: &InterfaceAccount<'info, Mint>, owner: &Signer<'info>, amount: u64) -> Result<()> {
    token_interface::transfer_checked(
        CpiContext::new(tp.key(), TransferChecked { from: from.to_account_info(), mint: mint.to_account_info(), to: to.to_account_info(), authority: owner.to_account_info() }),
        amount,
        mint.decimals,
    )
}

#[derive(Accounts)]
pub struct CreateLock<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = proto_mint)]
    pub config: Box<Account<'info, VeConfig>>,
    pub proto_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(init, payer = owner, space = 8 + Lock::INIT_SPACE, seeds = [LOCK_SEED, owner.key().as_ref()], bump)]
    pub lock: Box<Account<'info, Lock>>,
    /// CHECK: vault authority
    #[account(seeds = [ESCROW_SEED], bump = config.escrow_bump)]
    pub escrow: UncheckedAccount<'info>,
    #[account(init_if_needed, payer = owner, associated_token::mint = proto_mint, associated_token::authority = escrow, associated_token::token_program = token_program)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = proto_mint, token::authority = owner)]
    pub source: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn create_lock(ctx: Context<CreateLock>, amount: u64, duration: i64) -> Result<()> {
    let c = &ctx.accounts.config;
    require_gt!(amount, 0, VeError::Zero);
    require!(duration >= c.min_lock_secs && duration <= c.max_lock_secs, VeError::BadDuration);
    deposit(&ctx.accounts.token_program, &ctx.accounts.source, &ctx.accounts.vault, &ctx.accounts.proto_mint, &ctx.accounts.owner, amount)?;
    let l = &mut ctx.accounts.lock;
    l.bump = ctx.bumps.lock;
    l.owner = ctx.accounts.owner.key();
    l.amount = amount;
    l.end = Clock::get()?.unix_timestamp.checked_add(duration).ok_or(VeError::Overflow)?;
    Ok(())
}

#[derive(Accounts)]
pub struct ModifyLock<'info> {
    pub owner: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = proto_mint)]
    pub config: Box<Account<'info, VeConfig>>,
    pub proto_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, seeds = [LOCK_SEED, owner.key().as_ref()], bump = lock.bump, has_one = owner)]
    pub lock: Box<Account<'info, Lock>>,
    /// CHECK: vault authority
    #[account(seeds = [ESCROW_SEED], bump = config.escrow_bump)]
    pub escrow: UncheckedAccount<'info>,
    #[account(mut, associated_token::mint = proto_mint, associated_token::authority = escrow, associated_token::token_program = token_program)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = proto_mint, token::authority = owner)]
    pub source: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn increase_lock(ctx: Context<ModifyLock>, amount: u64) -> Result<()> {
    require_gt!(amount, 0, VeError::Zero);
    require!(Clock::get()?.unix_timestamp < ctx.accounts.lock.end, VeError::LockExpired);
    deposit(&ctx.accounts.token_program, &ctx.accounts.source, &ctx.accounts.vault, &ctx.accounts.proto_mint, &ctx.accounts.owner, amount)?;
    let l = &mut ctx.accounts.lock;
    l.amount = l.amount.checked_add(amount).ok_or(VeError::Overflow)?;
    Ok(())
}

#[derive(Accounts)]
pub struct ExtendLock<'info> {
    pub owner: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, VeConfig>>,
    #[account(mut, seeds = [LOCK_SEED, owner.key().as_ref()], bump = lock.bump, has_one = owner)]
    pub lock: Box<Account<'info, Lock>>,
}

pub fn extend_lock(ctx: Context<ExtendLock>, duration: i64) -> Result<()> {
    let c = &ctx.accounts.config;
    require!(duration >= c.min_lock_secs && duration <= c.max_lock_secs, VeError::BadDuration);
    let now = Clock::get()?.unix_timestamp;
    let l = &mut ctx.accounts.lock;
    require!(now < l.end, VeError::LockExpired);
    let new_end = now.checked_add(duration).ok_or(VeError::Overflow)?;
    require_gt!(new_end, l.end, VeError::BadDuration);
    l.end = new_end;
    Ok(())
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = proto_mint)]
    pub config: Box<Account<'info, VeConfig>>,
    pub proto_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, close = owner, seeds = [LOCK_SEED, owner.key().as_ref()], bump = lock.bump, has_one = owner)]
    pub lock: Box<Account<'info, Lock>>,
    /// CHECK: vault authority
    #[account(seeds = [ESCROW_SEED], bump = config.escrow_bump)]
    pub escrow: UncheckedAccount<'info>,
    #[account(mut, associated_token::mint = proto_mint, associated_token::authority = escrow, associated_token::token_program = token_program)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = proto_mint)]
    pub destination: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
    require!(Clock::get()?.unix_timestamp >= ctx.accounts.lock.end, VeError::LockActive);
    let seeds: &[&[u8]] = &[ESCROW_SEED, &[ctx.accounts.config.escrow_bump]];
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            TransferChecked { from: ctx.accounts.vault.to_account_info(), mint: ctx.accounts.proto_mint.to_account_info(), to: ctx.accounts.destination.to_account_info(), authority: ctx.accounts.escrow.to_account_info() },
            &[seeds],
        ),
        ctx.accounts.lock.amount,
        ctx.accounts.proto_mint.decimals,
    )
}
