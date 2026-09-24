use crate::{cpi, error::VeError, state::*, CONFIG_SEED, ESCROW_SEED, GAUGE_SEED, ROUTE_SEED, TREASURY_SEED};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct ConfigParams {
    pub epoch_secs: i64,
    pub max_lock_secs: i64,
    pub min_lock_secs: i64,
    pub recycle_cap: u64,
    pub recycle_slippage_bps: u16,
}

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + VeConfig::INIT_SPACE, seeds = [CONFIG_SEED], bump)]
    pub config: Box<Account<'info, VeConfig>>,
    pub proto_mint: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK: cp-swap program this deployment uses
    #[account(executable)]
    pub cpmm_program: UncheckedAccount<'info>,
    /// CHECK: authority of the locked-PROTO vault
    #[account(seeds = [ESCROW_SEED], bump)]
    pub escrow: UncheckedAccount<'info>,
    /// CHECK: fee receiver / POL owner
    #[account(seeds = [TREASURY_SEED], bump)]
    pub treasury: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn init_config(ctx: Context<InitConfig>, p: ConfigParams) -> Result<()> {
    require_gt!(p.epoch_secs, 0, VeError::BadDuration);
    require_gt!(p.max_lock_secs, 0, VeError::BadDuration);
    require!(p.min_lock_secs > 0 && p.min_lock_secs <= p.max_lock_secs, VeError::BadDuration);
    require!(p.recycle_slippage_bps <= 10_000, VeError::BadBps);
    let c = &mut ctx.accounts.config;
    c.bump = ctx.bumps.config;
    c.escrow_bump = ctx.bumps.escrow;
    c.treasury_bump = ctx.bumps.treasury;
    c.admin = ctx.accounts.admin.key();
    c.proto_mint = ctx.accounts.proto_mint.key();
    c.cpmm_program = ctx.accounts.cpmm_program.key();
    c.epoch_start = Clock::get()?.unix_timestamp;
    c.epoch_secs = p.epoch_secs;
    c.max_lock_secs = p.max_lock_secs;
    c.min_lock_secs = p.min_lock_secs;
    c.recycle_cap = p.recycle_cap;
    c.recycle_slippage_bps = p.recycle_slippage_bps;
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct UpdateParams {
    pub new_admin: Option<Pubkey>,
    pub recycle_cap: Option<u64>,
    pub recycle_slippage_bps: Option<u16>,
    pub min_lock_secs: Option<i64>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ VeError::Unauthorized)]
    pub config: Box<Account<'info, VeConfig>>,
}

pub fn update_config(ctx: Context<UpdateConfig>, p: UpdateParams) -> Result<()> {
    let c = &mut ctx.accounts.config;
    if let Some(a) = p.new_admin { c.admin = a; }
    if let Some(v) = p.recycle_cap { c.recycle_cap = v; }
    if let Some(v) = p.recycle_slippage_bps { require!(v <= 10_000, VeError::BadBps); c.recycle_slippage_bps = v; }
    if let Some(v) = p.min_lock_secs { require!(v > 0 && v <= c.max_lock_secs, VeError::BadDuration); c.min_lock_secs = v; }
    Ok(())
}

#[derive(Accounts)]
pub struct SetRoute<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ VeError::Unauthorized)]
    pub config: Box<Account<'info, VeConfig>>,
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(init_if_needed, payer = admin, space = 8 + QuoteRoute::INIT_SPACE, seeds = [ROUTE_SEED, quote_mint.key().as_ref()], bump)]
    pub route: Box<Account<'info, QuoteRoute>>,
    #[account(seeds = [GAUGE_SEED, gauge.collection.as_ref()], bump = gauge.bump, constraint = gauge.quote_mint == quote_mint.key() @ VeError::InvalidAccount)]
    pub gauge: Box<Account<'info, Gauge>>,
    /// CHECK: cp-swap PoolState for PROTO/quote, owned by config.cpmm_program; mints verified here
    #[account(owner = config.cpmm_program @ VeError::InvalidAccount)]
    pub pol_pool: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn set_route(ctx: Context<SetRoute>, pol_bps: u16) -> Result<()> {
    require!(pol_bps <= 10_000, VeError::BadBps);
    {
        let d = ctx.accounts.pol_pool.try_borrow_data()?;
        require!(d.len() > cpi::POOL_CREATOR_FEES_1 + 8, VeError::InvalidAccount);
        let (m0, m1) = (cpi::pk(&d, cpi::POOL_MINT_0), cpi::pk(&d, cpi::POOL_MINT_1));
        let (proto, quote) = (ctx.accounts.config.proto_mint, ctx.accounts.quote_mint.key());
        require!((m0 == proto && m1 == quote) || (m0 == quote && m1 == proto), VeError::InvalidAccount);
    }
    let r = &mut ctx.accounts.route;
    r.bump = ctx.bumps.route;
    r.quote_mint = ctx.accounts.quote_mint.key();
    r.gauge = ctx.accounts.gauge.key();
    r.pol_pool = ctx.accounts.pol_pool.key();
    r.pol_bps = pol_bps;
    Ok(())
}

#[derive(Accounts)]
pub struct TreasuryTransfer<'info> {
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ VeError::Unauthorized)]
    pub config: Box<Account<'info, VeConfig>>,
    /// CHECK: PDA
    #[account(seeds = [TREASURY_SEED], bump = config.treasury_bump)]
    pub treasury: UncheckedAccount<'info>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = mint, token::authority = treasury)]
    pub from: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = mint)]
    pub to: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn treasury_transfer(ctx: Context<TreasuryTransfer>, amount: u64) -> Result<()> {
    let seeds: &[&[u8]] = &[TREASURY_SEED, &[ctx.accounts.config.treasury_bump]];
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            TransferChecked { from: ctx.accounts.from.to_account_info(), mint: ctx.accounts.mint.to_account_info(), to: ctx.accounts.to.to_account_info(), authority: ctx.accounts.treasury.to_account_info() },
            &[seeds],
        ),
        amount,
        ctx.accounts.mint.decimals,
    )
}
