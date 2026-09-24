use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{
    clock::now,
    state::{Reactor, ReactorConfig},
};

use super::handle_sync_reactor;

/// Update the reactor's global indexes and collect the ray rewards
#[derive(Accounts)]
pub struct SyncAndCollectRayRewards<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        has_one = owner,
    )]
    pub reactor: Account<'info, Reactor>,

    #[account(
        mut,
        has_one = ray_reward_hopper
    )]
    pub reactor_config: Account<'info, ReactorConfig>,

    #[account(mut)]
    pub ray_reward_hopper: Account<'info, TokenAccount>,

    #[account(mut)]
    pub ray_dst: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

impl<'i> SyncAndCollectRayRewards<'i> {
    fn transfer_context(&self) -> CpiContext<'_, '_, '_, 'i, Transfer<'i>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.ray_reward_hopper.to_account_info(),
                to: self.ray_dst.to_account_info(),
                authority: self.reactor_config.to_account_info(),
            },
        )
    }
}

pub fn handler(ctx: Context<SyncAndCollectRayRewards>) -> Result<()> {
    let now = now();

    // Update the reactor's global indexes
    handle_sync_reactor(
        &mut ctx.accounts.reactor,
        &mut ctx.accounts.reactor_config,
        now,
    );

    let ray_rewards = ctx.accounts.reactor.collect_ray_rewards();

    token::transfer(
        ctx.accounts
            .transfer_context()
            .with_signer(&[&ctx.accounts.reactor_config.seeds()]),
        ray_rewards,
    )?;

    Ok(())
}
