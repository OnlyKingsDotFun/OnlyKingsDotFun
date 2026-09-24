use crate::{clock::now, state::*};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

/// Deposit LP tokens from owner into escrow
#[derive(Accounts)]
pub struct Deposit<'info> {
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
    pub lp_src: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

impl<'i> Deposit<'i> {
    fn deposit_lp_ctx(&self) -> CpiContext<'_, '_, '_, 'i, Transfer<'i>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.lp_src.to_account_info(),
                to: self.escrow.to_account_info(),
                authority: self.owner.to_account_info(),
            },
        )
    }

    fn cpi_deposit_lp(&mut self, amount: u64) -> Result<()> {
        token::transfer(self.deposit_lp_ctx(), amount)
    }
}

pub fn handler(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    // sync global index before performing deposit
    let now = now();
    ctx.accounts.time_tracker.deposit_lp(now, amount);

    ctx.accounts
        .personal_position
        .inc_amount(ctx.accounts.time_tracker.get_index().into(), amount);

    ctx.accounts
        .cpi_deposit_lp(amount)
        .expect("deposit LP failed");

    Ok(())
}
