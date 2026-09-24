use crate::{cpi, error::LaunchError, state::*, LAUNCH_SEED};
use anchor_lang::prelude::*;

/// Permissionless: open the crank state for a migrated launch on one of our configs.
#[derive(Accounts)]
pub struct InitLaunch<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [b"quote", quote_config.quote_mint.as_ref()], bump = quote_config.bump)]
    pub quote_config: Account<'info, QuoteLaunchConfig>,
    /// CHECK: DBC VirtualPool on `quote_config.dbc_config`, migrated
    #[account(owner = cpi::DBC_PROGRAM @ LaunchError::InvalidAccount)]
    pub virtual_pool: UncheckedAccount<'info>,
    /// CHECK: the DAMM v2 pool the curve migrated into; verified against the position in `unwind`
    #[account(owner = cpi::DAMM_V2_PROGRAM @ LaunchError::InvalidAccount)]
    pub damm_pool: UncheckedAccount<'info>,
    #[account(init, seeds = [LAUNCH_SEED, virtual_pool.key().as_ref()], bump, payer = payer, space = 8 + Launch::INIT_SPACE)]
    pub launch: Account<'info, Launch>,
    pub system_program: Program<'info, System>,
}
pub fn init_launch(ctx: Context<InitLaunch>) -> Result<()> {
    let vp = ctx.accounts.virtual_pool.try_borrow_data()?;
    require!(vp.len() > cpi::VP_IS_MIGRATED && vp[..8] == cpi::DBC_VIRTUAL_POOL_DISC, LaunchError::InvalidAccount);
    require_keys_eq!(cpi::pk(&vp, cpi::VP_CONFIG), ctx.accounts.quote_config.dbc_config, LaunchError::PoolConfigMismatch);
    require!(vp[cpi::VP_IS_MIGRATED] != 0, LaunchError::NotMigrated);
    let base_mint = cpi::pk(&vp, cpi::VP_BASE_MINT);
    drop(vp);
    // the DAMM pool must be base/quote in either order
    let pd = ctx.accounts.damm_pool.try_borrow_data()?;
    require!(pd.len() > cpi::DAMM_POOL_TOKEN_B_VAULT + 32 && pd[..8] == cpi::DAMM_POOL_DISC, LaunchError::InvalidAccount);
    let (a, b) = (cpi::pk(&pd, cpi::DAMM_POOL_TOKEN_A_MINT), cpi::pk(&pd, cpi::DAMM_POOL_TOKEN_B_MINT));
    let q = ctx.accounts.quote_config.quote_mint;
    require!((a == base_mint && b == q) || (a == q && b == base_mint), LaunchError::BaseMismatch);
    drop(pd);
    let l = &mut ctx.accounts.launch;
    l.bump = ctx.bumps.launch;
    l.step = Step::Created;
    l.quote_mint = q;
    l.base_mint = base_mint;
    l.virtual_pool = ctx.accounts.virtual_pool.key();
    l.dbc_config = ctx.accounts.quote_config.dbc_config;
    l.damm_pool = ctx.accounts.damm_pool.key();
    Ok(())
}
