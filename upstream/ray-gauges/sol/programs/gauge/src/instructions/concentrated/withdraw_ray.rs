use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use personal_rewarder_cl::PersonalRewarderCl;
use raydium_amm_v3::states::PersonalPositionState;

use crate::state::*;

/// Collect earned RAY rewards for the personal rewarder
#[derive(Accounts)]
pub struct WithdrawRayCl<'info> {
    /// Prove ownership of the position by owning the NFT
    pub nft_owner: Signer<'info>,

    /// The token account for the NFT
    /// The constraint links it to the personal position
    /// This NFT token account is essentially a junction table connecting the signer to the personal position
    #[account(
        constraint = nft_account.mint == personal_position.nft_mint,
        constraint = nft_account.amount == 1,
        token::authority = nft_owner
    )]
    pub nft_account: Box<Account<'info, TokenAccount>>,

    /// The position with the CLMM pool
    pub personal_position: Box<Account<'info, PersonalPositionState>>,

    /// Global, read-only GaugeConfig
    /// Constrains the ray_hopper
    #[account(
        has_one = ray_hopper
    )]
    pub gauge_config: Account<'info, GaugeConfig>,

    /// Constrain that the personal_rewarder is linked to the NFT owner via the liquidity position
    #[account(
        mut,
        constraint = personal_rewarder.pool_position == personal_position.key()
    )]
    pub personal_rewarder: Account<'info, PersonalRewarderCl>,

    #[account(mut)]
    pub ray_hopper: Account<'info, TokenAccount>,

    #[account(mut)]
    pub ray_dst: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

impl<'info> WithdrawRayCl<'info> {
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

pub fn handler(ctx: Context<WithdrawRayCl>) -> Result<WithdrawRayClEvent> {
    let ray = ctx.accounts.personal_rewarder.collect();

    token::transfer(
        ctx.accounts
            .withdraw_ray_ctx()
            .with_signer(&[&ctx.accounts.gauge_config.seeds()]),
        ray,
    )?;

    let evt = WithdrawRayClEvent {
        nft_owner: ctx.accounts.nft_owner.key(),
        personal_rewarder: ctx.accounts.personal_rewarder.key(),
        amount_withdrawn: ray,
    };

    emit!(evt);

    Ok(evt)
}

#[event]
pub struct WithdrawRayClEvent {
    pub nft_owner: Pubkey,
    pub personal_rewarder: Pubkey,
    pub amount_withdrawn: u64,
}
