use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::state::*;

/// Collect earned RAY rewards for the personal rewarder
#[derive(Accounts)]
pub struct WithdrawRay<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        has_one = ray_hopper
    )]
    pub gauge_config: Account<'info, GaugeConfig>,

    #[account(
        mut,
        has_one = owner,
    )]
    pub personal_rewarder: Account<'info, PersonalRewarderCp>,

    #[account(mut)]
    pub ray_hopper: Account<'info, TokenAccount>,

    #[account(mut)]
    pub ray_dst: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

impl<'info> WithdrawRay<'info> {
    fn withdraw_ray_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.ray_hopper.to_account_info(),
                to: self.ray_dst.to_account_info(),
                authority: self.gauge_config.to_account_info(),
            },
        )
    }
}

pub fn handler(ctx: Context<WithdrawRay>) -> Result<WithdrawRayEvent> {
    let ray = ctx.accounts.personal_rewarder.collect();

    token::transfer(
        ctx.accounts
            .withdraw_ray_ctx()
            .with_signer(&[&ctx.accounts.gauge_config.seeds()]),
        ray,
    )?;

    let evt = WithdrawRayEvent {
        owner: ctx.accounts.owner.key(),
        personal_rewarder: ctx.accounts.personal_rewarder.key(),
        amount_withdrawn: ray,
    };

    emit!(evt);

    Ok(evt)
}

#[event]
pub struct WithdrawRayEvent {
    pub owner: Pubkey,
    pub personal_rewarder: Pubkey,
    pub amount_withdrawn: u64,
}
