use crate::{cpi, error::LaunchError, state::*, GLOBAL_SEED, LAUNCH_SEED, PARTNER_SEED};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

/// Step 1: claim fees, remove all liquidity from the partner's DAMM v2 position, close it.
#[derive(Accounts)]
pub struct Unwind<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Box<Account<'info, Global>>,
    /// CHECK: partner PDA, owner of the position NFT
    #[account(mut, seeds = [PARTNER_SEED], bump = global.partner_bump)]
    pub partner: UncheckedAccount<'info>,
    #[account(mut, seeds = [LAUNCH_SEED, launch.virtual_pool.as_ref()], bump = launch.bump, constraint = launch.step == Step::Created @ LaunchError::WrongStep)]
    pub launch: Box<Account<'info, Launch>>,
    /// CHECK: DAMM v2 pool recorded at init
    #[account(mut, address = launch.damm_pool)]
    pub damm_pool: UncheckedAccount<'info>,
    /// CHECK: DAMM v2 position; pool + owner checked in handler
    #[account(mut, owner = cpi::DAMM_V2_PROGRAM @ LaunchError::InvalidAccount)]
    pub position: UncheckedAccount<'info>,
    /// CHECK: position NFT mint
    #[account(mut)]
    pub position_nft_mint: UncheckedAccount<'info>,
    /// partner's token account holding the position NFT
    #[account(mut, token::authority = partner, constraint = position_nft_account.amount == 1 @ LaunchError::InvalidPosition)]
    pub position_nft_account: Box<InterfaceAccount<'info, TokenAccount>>,
    /// partner token accounts receiving the unwound liquidity
    #[account(mut, token::authority = partner)]
    pub partner_token_a: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::authority = partner)]
    pub partner_token_b: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: DAMM vaults, checked against the pool
    #[account(mut)]
    pub token_a_vault: UncheckedAccount<'info>,
    /// CHECK: validated in the handler or by the CPI target
    #[account(mut)]
    pub token_b_vault: UncheckedAccount<'info>,
    /// CHECK: mints
    pub token_a_mint: UncheckedAccount<'info>,
    /// CHECK: validated in the handler or by the CPI target
    pub token_b_mint: UncheckedAccount<'info>,
    /// CHECK
    pub token_a_program: UncheckedAccount<'info>,
    /// CHECK
    pub token_b_program: UncheckedAccount<'info>,
    /// CHECK
    pub token_2022_program: UncheckedAccount<'info>,
    /// CHECK: DAMM v2 constant pool authority
    #[account(address = cpi::DAMM_V2_POOL_AUTHORITY)]
    pub damm_pool_authority: UncheckedAccount<'info>,
    /// CHECK: DAMM v2 event authority PDA
    pub damm_event_authority: UncheckedAccount<'info>,
    /// CHECK
    #[account(address = cpi::DAMM_V2_PROGRAM)]
    pub damm_program: UncheckedAccount<'info>,
}

pub fn unwind<'info>(ctx: Context<'info, Unwind<'info>>) -> Result<()> {
    let a = &ctx.accounts;
    // position belongs to this pool and to the NFT the partner holds; must be fully liquid
    {
        let pd = a.position.try_borrow_data()?;
        require!(pd.len() > cpi::POSITION_PERM_LOCKED_LIQ + 16, LaunchError::InvalidPosition);
        require_keys_eq!(cpi::pk(&pd, cpi::POSITION_POOL), a.damm_pool.key(), LaunchError::InvalidPosition);
        require_keys_eq!(cpi::pk(&pd, cpi::POSITION_NFT_MINT), a.position_nft_mint.key(), LaunchError::InvalidPosition);
        require_keys_eq!(a.position_nft_account.mint, a.position_nft_mint.key(), LaunchError::InvalidPosition);
        let vested = u128::from_le_bytes(pd[cpi::POSITION_VESTED_LIQ..cpi::POSITION_VESTED_LIQ + 16].try_into().unwrap());
        let locked = u128::from_le_bytes(pd[cpi::POSITION_PERM_LOCKED_LIQ..cpi::POSITION_PERM_LOCKED_LIQ + 16].try_into().unwrap());
        require!(vested == 0 && locked == 0, LaunchError::PositionLocked);
        let pool = a.damm_pool.try_borrow_data()?;
        require_keys_eq!(cpi::pk(&pool, cpi::DAMM_POOL_TOKEN_A_MINT), a.token_a_mint.key(), LaunchError::InvalidAccount);
        require_keys_eq!(cpi::pk(&pool, cpi::DAMM_POOL_TOKEN_B_MINT), a.token_b_mint.key(), LaunchError::InvalidAccount);
        require_keys_eq!(cpi::pk(&pool, cpi::DAMM_POOL_TOKEN_A_VAULT), a.token_a_vault.key(), LaunchError::InvalidAccount);
        require_keys_eq!(cpi::pk(&pool, cpi::DAMM_POOL_TOKEN_B_VAULT), a.token_b_vault.key(), LaunchError::InvalidAccount);
        require_keys_eq!(a.partner_token_a.mint, a.token_a_mint.key(), LaunchError::InvalidAccount);
        require_keys_eq!(a.partner_token_b.mint, a.token_b_mint.key(), LaunchError::InvalidAccount);
    }
    let bump = [a.global.partner_bump];
    let seeds: &[&[u8]] = &[PARTNER_SEED, &bump];
    let p = cpi::DammPosition {
        pool: &a.damm_pool, position: &a.position, position_nft_account: &a.position_nft_account.to_account_info(), position_nft_mint: &a.position_nft_mint,
        token_a_account: &a.partner_token_a.to_account_info(), token_b_account: &a.partner_token_b.to_account_info(), token_a_vault: &a.token_a_vault, token_b_vault: &a.token_b_vault,
        token_a_mint: &a.token_a_mint, token_b_mint: &a.token_b_mint, token_a_program: &a.token_a_program, token_b_program: &a.token_b_program,
        event_authority: &a.damm_event_authority, program: &a.damm_program, pool_authority: &a.damm_pool_authority,
    };
    let (qa, qb) = (a.partner_token_a.amount, a.partner_token_b.amount);
    cpi::damm_claim_position_fee(&p, &a.partner.to_account_info(), seeds)?;
    cpi::damm_remove_all_liquidity(&p, &a.partner.to_account_info(), seeds)?;
    cpi::damm_close_position(&p, &a.partner.to_account_info(), &a.payer.to_account_info(), &a.token_2022_program, seeds)?;
    ctx.accounts.partner_token_a.reload()?;
    ctx.accounts.partner_token_b.reload()?;
    let (da, db) = (ctx.accounts.partner_token_a.amount - qa, ctx.accounts.partner_token_b.amount - qb);
    let l = &mut ctx.accounts.launch;
    let a_is_quote = ctx.accounts.token_a_mint.key() == l.quote_mint;
    l.quote_total = if a_is_quote { da } else { db };
    l.base_total = if a_is_quote { db } else { da };
    l.step = Step::Unwound;
    Ok(())
}
