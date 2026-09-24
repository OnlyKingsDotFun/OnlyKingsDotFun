use anchor_lang::prelude::*;

use crate::{
    clock::now,
    state::{Reactor, ReactorConfig},
};

#[derive(Accounts)]
pub struct SyncReactor<'info> {
    #[account(mut)]
    pub reactor: Account<'info, Reactor>,

    #[account(mut)]
    pub reactor_config: Account<'info, ReactorConfig>,
}

pub fn handler(ctx: Context<SyncReactor>) -> Result<()> {
    let now = now();

    handle_sync_reactor(
        &mut ctx.accounts.reactor,
        &mut ctx.accounts.reactor_config,
        now,
    );

    Ok(())
}

/// Updates the global indexes and increases the isoRAY & staging rewards
pub fn handle_sync_reactor(
    reactor: &mut Reactor,
    reactor_config: &mut ReactorConfig,
    now: u64,
) -> u64 {
    // updates the global indexes
    reactor_config.deposit_ray(0, now);

    // Increasing isoRAY & staging rewards
    let new_reactor_amount = reactor.deposit_ray(
        0,
        reactor_config.iso_ray_index.into(),
        reactor_config.ray_reward_index.into(),
    );

    new_reactor_amount
}
