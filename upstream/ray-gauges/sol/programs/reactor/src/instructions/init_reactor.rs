use anchor_lang::prelude::*;

use crate::{state::Reactor, REACTOR_SEED};

#[derive(Accounts)]
pub struct InitReactor<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: permissionless reactor owner
    pub owner: UncheckedAccount<'info>,

    #[account(
        init,
        payer = payer,
        space = Reactor::LEN,
        seeds = [
            REACTOR_SEED.as_bytes(),
            owner.key.as_ref(),
        ],
        bump
    )]
    pub reactor: Account<'info, Reactor>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitReactor>) -> Result<()> {
    // Since the Reactor is created with a 0 balance of RAY, it does not need to get the latest values from the global state
    // nor does it need to trigger an update to the global state
    ctx.accounts.reactor.owner = ctx.accounts.owner.key();

    Ok(())
}
