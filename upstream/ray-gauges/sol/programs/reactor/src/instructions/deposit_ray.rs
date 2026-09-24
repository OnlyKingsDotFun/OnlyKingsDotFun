use anchor_lang::prelude::*;
use anchor_spl::token::{self, *};

use crate::{
    clock::now,
    state::{Reactor, ReactorConfig},
};

#[derive(Accounts)]
pub struct DepositRay<'info> {
    /// TODO - consider making this permissionless
    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: mint constrained by token program
    #[account(mut)]
    pub ray_src: Account<'info, TokenAccount>,

    /// CHECK: constrained by reactor_config
    #[account(mut)]
    pub ray_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        has_one = owner,
    )]
    pub reactor: Account<'info, Reactor>,

    #[account(
        mut,
        has_one = ray_vault,
    )]
    pub reactor_config: Account<'info, ReactorConfig>,

    pub token_program: Program<'info, Token>,
}

impl<'info> DepositRay<'info> {
    fn deposit_ray_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.ray_src.to_account_info(),
                to: self.ray_vault.to_account_info(),
                authority: self.owner.to_account_info(),
            },
        )
    }
}

pub fn handler(ctx: Context<DepositRay>, amount: u64) -> Result<DepositRayEvent> {
    let new_reactor_amount = handle_deposit_ray(
        &mut ctx.accounts.reactor_config,
        &mut ctx.accounts.reactor,
        amount,
        now(),
    );

    token::transfer(ctx.accounts.deposit_ray_ctx(), amount)?;

    ctx.accounts.ray_vault.reload()?;

    let evt = DepositRayEvent {
        amount_in: amount,
        new_global_amount: ctx.accounts.ray_vault.amount,
        new_reactor_amount,
    };

    emit!(evt);

    Ok(evt)
}

#[event]
pub struct DepositRayEvent {
    pub amount_in: u64,

    /// The new global amount of RAY deposited
    pub new_global_amount: u64,

    /// The new amount of RAY deposited in the reactor
    pub new_reactor_amount: u64,
}

fn handle_deposit_ray(
    reactor_config: &mut ReactorConfig,
    reactor: &mut Reactor,
    amount: u64,
    now: u64,
) -> u64 {
    // updates the global indexes
    // and increases the total RAY + total isoRAY in the reactor config
    reactor_config.deposit_ray(amount, now);

    // Deposit RAY for the Reactor
    // Increasing its isoRAY & staging rewards
    let new_reactor_amount = reactor.deposit_ray(
        amount,
        reactor_config.iso_ray_index.into(),
        reactor_config.ray_reward_index.into(),
    );

    new_reactor_amount
}
