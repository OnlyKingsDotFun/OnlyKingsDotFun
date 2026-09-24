use crate::{cpi, error::LaunchError, state::*, GLOBAL_SEED, PARTNER_SEED};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct GlobalParams {
    pub cpmm_program: Pubkey,
    pub cpmm_config: Pubkey,
}

#[derive(Accounts)]
pub struct InitGlobal<'info> {
    #[account(mut, address = crate::admin::ID @ LaunchError::NotApproved)]
    pub admin: Signer<'info>,
    #[account(init, seeds = [GLOBAL_SEED], bump, payer = admin, space = 8 + Global::INIT_SPACE)]
    pub global: Account<'info, Global>,
    /// CHECK: PDA that is the DBC fee_claimer / leftover_receiver and owns everything the crank moves
    #[account(seeds = [PARTNER_SEED], bump)]
    pub partner: UncheckedAccount<'info>,
    pub protocol_mint: InterfaceAccount<'info, Mint>,
    pub system_program: Program<'info, System>,
}
pub fn init_global(ctx: Context<InitGlobal>, params: GlobalParams) -> Result<()> {
    let g = &mut ctx.accounts.global;
    g.bump = ctx.bumps.global;
    g.partner_bump = ctx.bumps.partner;
    g.protocol_mint = ctx.accounts.protocol_mint.key();
    g.cpmm_program = params.cpmm_program;
    g.cpmm_config = params.cpmm_config;
    g.dbc_program = cpi::DBC_PROGRAM;
    g.damm_v2_program = cpi::DAMM_V2_PROGRAM;
    Ok(())
}

#[derive(Accounts)]
pub struct SetProtocolMint<'info> {
    #[account(address = crate::admin::ID @ LaunchError::NotApproved)]
    pub admin: Signer<'info>,
    #[account(mut, seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, Global>,
    pub protocol_mint: InterfaceAccount<'info, Mint>,
}
pub fn set_protocol_mint(ctx: Context<SetProtocolMint>) -> Result<()> {
    ctx.accounts.global.protocol_mint = ctx.accounts.protocol_mint.key();
    Ok(())
}

#[derive(Accounts)]
pub struct RegisterQuote<'info> {
    #[account(mut, address = crate::admin::ID @ LaunchError::NotApproved)]
    pub admin: Signer<'info>,
    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, Global>,
    /// CHECK: partner PDA
    #[account(seeds = [PARTNER_SEED], bump = global.partner_bump)]
    pub partner: UncheckedAccount<'info>,
    pub quote_mint: InterfaceAccount<'info, Mint>,
    /// CHECK: DBC PoolConfig; must name `partner` as fee_claimer and leftover_receiver, and this quote
    #[account(owner = cpi::DBC_PROGRAM @ LaunchError::InvalidAccount)]
    pub dbc_config: UncheckedAccount<'info>,
    /// CHECK: cp-swap TokenCollection for this quote (rule LaunchpadDbc)
    pub collection: UncheckedAccount<'info>,
    /// CHECK: cp-swap pool bound to `collection` (the launch multipool)
    pub collection_pool: UncheckedAccount<'info>,
    /// CHECK: cp-swap protocol/quote pool
    pub protocol_quote_pool: UncheckedAccount<'info>,
    #[account(init, seeds = [b"quote", quote_mint.key().as_ref()], bump, payer = admin, space = 8 + QuoteLaunchConfig::INIT_SPACE)]
    pub quote_config: Account<'info, QuoteLaunchConfig>,
    pub system_program: Program<'info, System>,
}
pub fn register_quote(ctx: Context<RegisterQuote>) -> Result<()> {
    let d = ctx.accounts.dbc_config.try_borrow_data()?;
    require!(d.len() > cpi::CFG_LEFTOVER_RECEIVER + 32 && d[..8] == cpi::DBC_POOL_CONFIG_DISC, LaunchError::InvalidAccount);
    require_keys_eq!(cpi::pk(&d, cpi::CFG_FEE_CLAIMER), ctx.accounts.partner.key(), LaunchError::ConfigNotOurs);
    require_keys_eq!(cpi::pk(&d, cpi::CFG_LEFTOVER_RECEIVER), ctx.accounts.partner.key(), LaunchError::LeftoverNotOurs);
    require_keys_eq!(cpi::pk(&d, cpi::CFG_QUOTE_MINT), ctx.accounts.quote_mint.key(), LaunchError::QuoteMismatch);
    drop(d);
    let q = &mut ctx.accounts.quote_config;
    q.bump = ctx.bumps.quote_config;
    q.quote_mint = ctx.accounts.quote_mint.key();
    q.dbc_config = ctx.accounts.dbc_config.key();
    q.collection = ctx.accounts.collection.key();
    q.collection_pool = ctx.accounts.collection_pool.key();
    q.protocol_quote_pool = ctx.accounts.protocol_quote_pool.key();
    Ok(())
}

#[derive(Accounts)]
pub struct WithdrawPartner<'info> {
    #[account(address = crate::admin::ID @ LaunchError::NotApproved)]
    pub admin: Signer<'info>,
    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, Global>,
    /// CHECK: partner PDA
    #[account(seeds = [PARTNER_SEED], bump = global.partner_bump)]
    pub partner: UncheckedAccount<'info>,
    #[account(mut, token::authority = partner)]
    pub from: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = from.mint)]
    pub to: InterfaceAccount<'info, TokenAccount>,
    #[account(address = from.mint)]
    pub mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}
pub fn withdraw_partner(ctx: Context<WithdrawPartner>, amount: u64) -> Result<()> {
    require_gt!(amount, 0, LaunchError::Empty);
    let bump = [ctx.accounts.global.partner_bump];
    let seeds: &[&[u8]] = &[PARTNER_SEED, &bump];
    token_interface::transfer_checked(
        CpiContext::new_with_signer(ctx.accounts.token_program.key(), TransferChecked { from: ctx.accounts.from.to_account_info(), mint: ctx.accounts.mint.to_account_info(), to: ctx.accounts.to.to_account_info(), authority: ctx.accounts.partner.to_account_info() }, &[seeds]),
        amount,
        ctx.accounts.mint.decimals,
    )
}
