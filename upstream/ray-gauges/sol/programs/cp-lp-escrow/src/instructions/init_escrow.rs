use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use crate::raydium_cp_swap::accounts::PoolState;
use crate::{clock::now, state::*, LP_ESCROW_SEED, TIME_TRACKER_SEED};

#[derive(Accounts)]
pub struct InitEscrow<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    pub pool_state: AccountLoader<'info, PoolState>,

    #[account(
        address = pool_state.load()?.lp_mint
    )]
    pub lp_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = payer,
        seeds = [
            TIME_TRACKER_SEED,
            pool_state.key().as_ref(),
        ],
        space = TimeTracker::SIZE,
        bump
    )]
    pub time_tracker: Account<'info, TimeTracker>,

    #[account(
        init,
        payer = payer,
        seeds = [
            LP_ESCROW_SEED,
            pool_state.key().as_ref(),
        ],
        bump,
        token::mint = lp_mint,
        token::authority = time_tracker, 
    )]
    pub escrow: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}
pub fn handler(ctx: Context<InitEscrow>) -> Result<()> {
    ctx.accounts.time_tracker.set_inner(TimeTracker::new(
        ctx.accounts.pool_state.key(),
        ctx.accounts.escrow.key(),
        [ctx.bumps.time_tracker],
        now(),
    ));

    Ok(())
}
