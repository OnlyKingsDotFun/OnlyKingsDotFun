use crate::{cpi, error::LaunchError, state::*, GLOBAL_SEED, LAUNCH_SEED, PARTNER_SEED};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

/// Step 4: swap the last third of quote into newmeme through the quote pair, register newmeme in
/// the launch collection with the DBC proof, add it to the multipool, deposit all newmeme into its vault.
#[derive(Accounts)]
pub struct JoinMultipool<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Box<Account<'info, Global>>,
    /// CHECK: partner PDA
    #[account(mut, seeds = [PARTNER_SEED], bump = global.partner_bump)]
    pub partner: UncheckedAccount<'info>,
    #[account(mut, seeds = [LAUNCH_SEED, launch.virtual_pool.as_ref()], bump = launch.bump, constraint = launch.step == Step::ProtocolPaired @ LaunchError::WrongStep)]
    pub launch: Box<Account<'info, Launch>>,
    #[account(seeds = [b"quote", launch.quote_mint.as_ref()], bump = quote_config.bump)]
    pub quote_config: Box<Account<'info, QuoteLaunchConfig>>,
    /// CHECK: cp-swap fork
    #[account(address = global.cpmm_program)]
    pub cpmm_program: UncheckedAccount<'info>,
    /// CHECK: cp-swap vault authority
    pub cpmm_authority: UncheckedAccount<'info>,
    // --- swap quote -> newmeme on the pair from step 2
    /// CHECK
    #[account(mut, address = launch.quote_pair @ LaunchError::InvalidAccount)]
    pub quote_pair: UncheckedAccount<'info>,
    /// CHECK
    pub quote_pair_config: UncheckedAccount<'info>,
    #[account(mut, token::authority = partner, token::mint = launch.quote_mint)]
    pub partner_quote: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::authority = partner, token::mint = launch.base_mint)]
    pub partner_base: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK
    #[account(mut)]
    pub qp_quote_vault: UncheckedAccount<'info>,
    /// CHECK
    #[account(mut)]
    pub qp_base_vault: UncheckedAccount<'info>,
    #[account(address = launch.quote_mint)]
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(address = launch.base_mint)]
    pub base_mint: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK
    pub quote_token_program: UncheckedAccount<'info>,
    pub base_token_program: Interface<'info, TokenInterface>,
    /// CHECK
    #[account(mut)]
    pub qp_observation: UncheckedAccount<'info>,
    // --- collection membership + multipool
    /// CHECK: cp-swap TokenCollection for this quote
    #[account(mut, address = quote_config.collection @ LaunchError::InvalidAccount)]
    pub collection: UncheckedAccount<'info>,
    /// CHECK: its ruleset
    pub ruleset: UncheckedAccount<'info>,
    /// CHECK: CollectionMember PDA for newmeme (created by cp-swap if missing)
    #[account(mut)]
    pub collection_member: UncheckedAccount<'info>,
    /// CHECK: DBC virtual pool (proof)
    #[account(address = launch.virtual_pool)]
    pub virtual_pool: UncheckedAccount<'info>,
    /// CHECK: DBC config (proof)
    #[account(address = launch.dbc_config)]
    pub dbc_config: UncheckedAccount<'info>,
    /// CHECK: the launch multipool
    #[account(address = quote_config.collection_pool @ LaunchError::InvalidAccount)]
    pub collection_pool: UncheckedAccount<'info>,
    /// CHECK: its PoolMembers
    #[account(mut)]
    pub pool_members: UncheckedAccount<'info>,
    /// CHECK: newmeme member vault PDA (created by cp-swap if missing)
    #[account(mut)]
    pub member_vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    /// CHECK
    pub rent: UncheckedAccount<'info>,
}

pub fn join_multipool<'info>(ctx: Context<'info, JoinMultipool<'info>>) -> Result<()> {
    let a = &ctx.accounts;
    let bump = [a.global.partner_bump];
    let seeds: &[&[u8]] = &[PARTNER_SEED, &bump];
    // last third of quote -> newmeme, routed through our own pair
    let quote = a.launch.quote_total.saturating_sub(a.launch.quote_spent).min(a.partner_quote.amount);
    if quote > 0 {
        cpi::cpmm_swap_base_input(&cpi::CpmmSwap {
            program: &a.cpmm_program, payer: &a.partner.to_account_info(), authority: &a.cpmm_authority, amm_config: &a.quote_pair_config, pool_state: &a.quote_pair,
            input_token_account: &a.partner_quote.to_account_info(), output_token_account: &a.partner_base.to_account_info(), input_vault: &a.qp_quote_vault, output_vault: &a.qp_base_vault,
            input_token_program: &a.quote_token_program, output_token_program: &a.base_token_program.to_account_info(), input_token_mint: &a.quote_mint.to_account_info(), output_token_mint: &a.base_mint.to_account_info(), observation_state: &a.qp_observation,
        }, quote, 1, seeds)?;
    }
    // membership: idempotent (skip if the member account already exists)
    if a.collection_member.data_is_empty() {
        cpi::cpmm_register_member(&a.cpmm_program, &a.partner.to_account_info(), &a.collection, &a.ruleset, &a.base_mint.to_account_info(), &a.collection_member, &a.system_program.to_account_info(), &[a.virtual_pool.to_account_info(), a.dbc_config.to_account_info()], seeds)?;
    }
    if a.member_vault.data_is_empty() {
        cpi::cpmm_add_pool_member(&a.cpmm_program, &a.partner.to_account_info(), &a.cpmm_authority, &a.collection_pool, &a.pool_members, &a.collection_member, &a.base_mint.to_account_info(), &a.member_vault, &a.base_token_program.to_account_info(), &a.system_program.to_account_info(), &a.rent, seeds)?;
    }
    // every remaining newmeme goes into the multipool's member vault
    ctx.accounts.partner_base.reload()?;
    let a = &ctx.accounts;
    let all = a.partner_base.amount;
    if all > 0 {
        token_interface::transfer_checked(
            CpiContext::new_with_signer(a.base_token_program.key(), TransferChecked { from: a.partner_base.to_account_info(), mint: a.base_mint.to_account_info(), to: a.member_vault.to_account_info(), authority: a.partner.to_account_info() }, &[seeds]),
            all,
            a.base_mint.decimals,
        )?;
    }
    let l = &mut ctx.accounts.launch;
    l.quote_spent = l.quote_total;
    l.step = Step::Joined;
    Ok(())
}
