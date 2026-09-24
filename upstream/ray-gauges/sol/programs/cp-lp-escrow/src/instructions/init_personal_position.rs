use anchor_lang::prelude::*;

use crate::{clock::now, state::*, PERSONAL_POSITION_SEED};

#[derive(Accounts)]
pub struct InitPersonalPosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(mut)]
    pub time_tracker: Account<'info, TimeTracker>,

    #[account(
        init,
        payer = owner,
        space = PersonalPosition::SIZE,
        seeds = [
            PERSONAL_POSITION_SEED,
            time_tracker.key().as_ref(),
            owner.key().as_ref(),
        ],
        bump
    )]
    pub personal_position: Account<'info, PersonalPosition>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitPersonalPosition>) -> Result<()> {
    let now = now();
    ctx.accounts.time_tracker.update(now);

    let p = &mut ctx.accounts.personal_position;

    p.last_seen_index = ctx.accounts.time_tracker.get_index();
    p.time_tracker = ctx.accounts.time_tracker.key();
    p.owner = ctx.accounts.owner.key();

    Ok(())
}
