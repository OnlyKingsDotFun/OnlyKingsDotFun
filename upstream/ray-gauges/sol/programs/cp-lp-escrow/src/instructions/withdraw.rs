use crate::{clock::now, state::*};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

/// Withdraw LP tokens from escrow
#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        has_one = escrow,
    )]
    pub time_tracker: Account<'info, TimeTracker>,

    #[account(
        mut,
        has_one = owner,
        has_one = time_tracker
    )]
    pub personal_position: Account<'info, PersonalPosition>,

    #[account(mut)]
    pub escrow: Account<'info, TokenAccount>,

    #[account(mut)]
    pub lp_dst: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

impl<'i> Withdraw<'i> {
    fn withdraw_lp_ctx(&self) -> CpiContext<'_, '_, '_, 'i, Transfer<'i>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.escrow.to_account_info(),
                to: self.lp_dst.to_account_info(),
                authority: self.time_tracker.to_account_info(),
            },
        )
    }
}

pub fn handler(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    // sync global index before performing deposit
    let now = now();

    // update global index
    ctx.accounts.time_tracker.withdraw_lp(now, amount);

    // sync personal index before performing deposit
    ctx.accounts
        .personal_position
        .dec_amount(ctx.accounts.time_tracker.get_index().into(), amount);

    // withdraw the tokens
    token::transfer(
        ctx.accounts
            .withdraw_lp_ctx()
            .with_signer(&[&ctx.accounts.time_tracker.seeds()]),
        amount,
    )?;

    Ok(())
}
