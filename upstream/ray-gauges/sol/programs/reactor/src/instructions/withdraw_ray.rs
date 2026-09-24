use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::state::{Reactor, ReactorConfig};

#[derive(Accounts)]
pub struct WithdrawRay<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        has_one = owner,
    )]
    pub reactor: Account<'info, Reactor>,

    #[account(mut)]
    pub ray_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub ray_dst: Account<'info, TokenAccount>,

    #[account(
        mut,
        has_one = ray_vault,
    )]
    pub reactor_config: Account<'info, ReactorConfig>,

    pub token_program: Program<'info, Token>,
}

impl<'info> WithdrawRay<'info> {
    fn withdraw_ray_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.ray_vault.to_account_info(),
                to: self.ray_dst.to_account_info(),
                authority: self.reactor_config.to_account_info(),
            },
        )
    }

    fn cpi_withdraw_ray(&self, amount: u64) -> Result<()> {
        token::transfer(
            self.withdraw_ray_ctx()
                .with_signer(&[&self.reactor_config.seeds()]),
            amount,
        )
    }
}

pub fn handler(ctx: Context<WithdrawRay>, amount: u64) -> Result<()> {
    let current_ts = Clock::get()?.unix_timestamp as u64;
    ctx.accounts.reactor_config.withdraw_ray(amount, current_ts);

    ctx.accounts.reactor.withdraw_ray(
        amount,
        ctx.accounts.reactor_config.iso_ray_index.into(),
        ctx.accounts.reactor_config.ray_reward_index.into(),
    )?;

    // Transfer the amount of ray from the vault to the destination account
    ctx.accounts.cpi_withdraw_ray(amount)?;

    Ok(())
}
