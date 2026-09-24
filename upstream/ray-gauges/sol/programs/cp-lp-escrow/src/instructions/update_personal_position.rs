use crate::{clock::now, state::*};
use anchor_lang::prelude::*;

/// Deposit LP tokens from owner into escrow
#[derive(Accounts)]
pub struct UpdatePersonalPosition<'info> {
    #[account(mut)]
    pub time_tracker: Account<'info, TimeTracker>,

    #[account(
        mut,
        has_one = time_tracker
    )]
    pub personal_position: Account<'info, PersonalPosition>,
}

pub fn handler(ctx: Context<UpdatePersonalPosition>) -> Result<()> {
    let now = now();

    ctx.accounts.time_tracker.update(now);

    ctx.accounts
        .personal_position
        .update(ctx.accounts.time_tracker.get_index().into());

    Ok(())
}
