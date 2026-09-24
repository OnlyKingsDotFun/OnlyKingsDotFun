use crate::{cpi, error::LaunchError, state::*, GLOBAL_SEED, LAUNCH_SEED, PARTNER_SEED};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

/// The cp-swap `initialize` account set, shared by steps 2 and 3. Token order (0/1) is whatever
/// cp-swap requires (mint_0 < mint_1); the handler works out which side is newmeme.
#[derive(Accounts)]
pub struct CpmmPairAccounts<'info> {
    /// CHECK: cp-swap fork
    pub cpmm_program: UncheckedAccount<'info>,
    /// CHECK: cp-swap AmmConfig (must equal global.cpmm_config)
    pub amm_config: UncheckedAccount<'info>,
    /// CHECK: cp-swap vault authority PDA
    pub cpmm_authority: UncheckedAccount<'info>,
    /// CHECK: new pool PDA
    #[account(mut)]
    pub pool_state: UncheckedAccount<'info>,
    /// CHECK
    pub token_0_mint: UncheckedAccount<'info>,
    /// CHECK
    pub token_1_mint: UncheckedAccount<'info>,
    /// CHECK
    #[account(mut)]
    pub lp_mint: UncheckedAccount<'info>,
    /// CHECK: partner-owned token account for token_0; owner and mint verified in the handler
    #[account(mut)]
    pub partner_token_0: UncheckedAccount<'info>,
    /// CHECK: partner-owned token account for token_1; owner and mint verified in the handler
    #[account(mut)]
    pub partner_token_1: UncheckedAccount<'info>,
    /// CHECK: partner's LP ATA, created by cp-swap
    #[account(mut)]
    pub partner_lp: UncheckedAccount<'info>,
    /// CHECK
    #[account(mut)]
    pub token_0_vault: UncheckedAccount<'info>,
    /// CHECK
    #[account(mut)]
    pub token_1_vault: UncheckedAccount<'info>,
    /// CHECK: cp-swap create-pool fee receiver
    #[account(mut)]
    pub create_pool_fee: UncheckedAccount<'info>,
    /// CHECK
    #[account(mut)]
    pub observation_state: UncheckedAccount<'info>,
    /// CHECK
    pub token_program: UncheckedAccount<'info>,
    /// CHECK
    pub token_0_program: UncheckedAccount<'info>,
    /// CHECK
    pub token_1_program: UncheckedAccount<'info>,
    /// CHECK
    pub associated_token_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    /// CHECK
    pub rent: UncheckedAccount<'info>,
}

/// SPL/Token-2022 account layout: mint @0, owner @32
fn check_partner_token(acc: &AccountInfo, partner: &Pubkey, mint: &Pubkey) -> Result<()> {
    let d = acc.try_borrow_data()?;
    require!(d.len() >= 72, LaunchError::InvalidAccount);
    require_keys_eq!(cpi::pk(&d, 0), *mint, LaunchError::InvalidAccount);
    require_keys_eq!(cpi::pk(&d, 32), *partner, LaunchError::InvalidAccount);
    Ok(())
}

fn cpmm_init<'info>(c: &CpmmPairAccounts<'info>, partner: &AccountInfo<'info>, base_mint: Pubkey, other_mint: Pubkey, base_amount: u64, other_amount: u64, seeds: &[&[u8]]) -> Result<()> {
    check_partner_token(&c.partner_token_0, &partner.key(), &c.token_0_mint.key())?;
    check_partner_token(&c.partner_token_1, &partner.key(), &c.token_1_mint.key())?;
    let (a0, a1) = if c.token_0_mint.key() == base_mint {
        require_keys_eq!(c.token_1_mint.key(), other_mint, LaunchError::InvalidAccount);
        (base_amount, other_amount)
    } else {
        require_keys_eq!(c.token_0_mint.key(), other_mint, LaunchError::InvalidAccount);
        require_keys_eq!(c.token_1_mint.key(), base_mint, LaunchError::InvalidAccount);
        (other_amount, base_amount)
    };
    require_gt!(a0, 0, LaunchError::Empty);
    require_gt!(a1, 0, LaunchError::Empty);
    let init = cpi::CpmmInit {
        program: &c.cpmm_program, creator: partner, amm_config: &c.amm_config, authority: &c.cpmm_authority, pool_state: &c.pool_state,
        token_0_mint: &c.token_0_mint, token_1_mint: &c.token_1_mint, lp_mint: &c.lp_mint, creator_token_0: &c.partner_token_0, creator_token_1: &c.partner_token_1,
        creator_lp_token: &c.partner_lp, token_0_vault: &c.token_0_vault, token_1_vault: &c.token_1_vault, create_pool_fee: &c.create_pool_fee, observation_state: &c.observation_state,
        token_program: &c.token_program, token_0_program: &c.token_0_program, token_1_program: &c.token_1_program, associated_token_program: &c.associated_token_program,
        system_program: &c.system_program.to_account_info(), rent: &c.rent,
    };
    cpi::cpmm_initialize(&init, a0, a1, seeds)
}

fn third(l: &Launch) -> u64 {
    l.quote_total / 3
}
/// newmeme matching `quote` at the unwound ratio: base_total * quote / quote_total
fn base_for(l: &Launch, quote: u64) -> Result<u64> {
    u64::try_from(u128::from(l.base_total) * u128::from(quote) / u128::from(l.quote_total.max(1))).map_err(|_| LaunchError::Math.into())
}

/// Step 2: newmeme/quote pair with quote_total/3 and the proportional newmeme.
#[derive(Accounts)]
pub struct PairQuote<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Box<Account<'info, Global>>,
    /// CHECK: partner PDA (pool creator, pays cp-swap rent from its lamports)
    #[account(mut, seeds = [PARTNER_SEED], bump = global.partner_bump)]
    pub partner: UncheckedAccount<'info>,
    #[account(mut, seeds = [LAUNCH_SEED, launch.virtual_pool.as_ref()], bump = launch.bump, constraint = launch.step == Step::Unwound @ LaunchError::WrongStep)]
    pub launch: Box<Account<'info, Launch>>,
    pub pair: CpmmPairAccounts<'info>,
}
pub fn pair_quote<'info>(ctx: Context<'info, PairQuote<'info>>) -> Result<()> {
    let a = &ctx.accounts;
    require_keys_eq!(a.pair.cpmm_program.key(), a.global.cpmm_program, LaunchError::InvalidAccount);
    require_keys_eq!(a.pair.amm_config.key(), a.global.cpmm_config, LaunchError::InvalidAccount);
    let quote = third(&a.launch);
    let base = base_for(&a.launch, quote)?;
    let bump = [a.global.partner_bump];
    let seeds: &[&[u8]] = &[PARTNER_SEED, &bump];
    cpmm_init(&a.pair, &a.partner.to_account_info(), a.launch.base_mint, a.launch.quote_mint, base, quote, seeds)?;
    let l = &mut ctx.accounts.launch;
    l.quote_spent += quote;
    l.quote_pair = ctx.accounts.pair.pool_state.key();
    l.step = Step::QuotePaired;
    Ok(())
}

/// Step 3: swap quote_total/3 into the protocol token on the protocol/quote pool, then pair newmeme/protocol.
#[derive(Accounts)]
pub struct PairProtocol<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Box<Account<'info, Global>>,
    /// CHECK: partner PDA
    #[account(mut, seeds = [PARTNER_SEED], bump = global.partner_bump)]
    pub partner: UncheckedAccount<'info>,
    #[account(mut, seeds = [LAUNCH_SEED, launch.virtual_pool.as_ref()], bump = launch.bump, constraint = launch.step == Step::QuotePaired @ LaunchError::WrongStep)]
    pub launch: Box<Account<'info, Launch>>,
    #[account(seeds = [b"quote", launch.quote_mint.as_ref()], bump = quote_config.bump)]
    pub quote_config: Box<Account<'info, QuoteLaunchConfig>>,
    // --- swap quote -> protocol on the protocol/quote pool
    /// CHECK: protocol/quote pool (must equal quote_config.protocol_quote_pool)
    #[account(mut, address = quote_config.protocol_quote_pool @ LaunchError::InvalidAccount)]
    pub pq_pool: UncheckedAccount<'info>,
    /// CHECK
    pub pq_amm_config: UncheckedAccount<'info>,
    #[account(mut, token::authority = partner, token::mint = launch.quote_mint)]
    pub partner_quote: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::authority = partner, token::mint = global.protocol_mint)]
    pub partner_protocol: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK
    #[account(mut)]
    pub pq_quote_vault: UncheckedAccount<'info>,
    /// CHECK
    #[account(mut)]
    pub pq_protocol_vault: UncheckedAccount<'info>,
    /// CHECK
    pub quote_mint: UncheckedAccount<'info>,
    /// CHECK
    pub protocol_mint: UncheckedAccount<'info>,
    /// CHECK
    pub quote_token_program: UncheckedAccount<'info>,
    /// CHECK
    pub protocol_token_program: UncheckedAccount<'info>,
    /// CHECK
    #[account(mut)]
    pub pq_observation: UncheckedAccount<'info>,
    // --- new newmeme/protocol pair
    pub pair: CpmmPairAccounts<'info>,
}
pub fn pair_protocol<'info>(ctx: Context<'info, PairProtocol<'info>>) -> Result<()> {
    let a = &ctx.accounts;
    require_keys_eq!(a.pair.cpmm_program.key(), a.global.cpmm_program, LaunchError::InvalidAccount);
    require_keys_eq!(a.pair.amm_config.key(), a.global.cpmm_config, LaunchError::InvalidAccount);
    require_keys_eq!(a.quote_mint.key(), a.launch.quote_mint, LaunchError::QuoteMismatch);
    require_keys_eq!(a.protocol_mint.key(), a.global.protocol_mint, LaunchError::InvalidAccount);
    let quote = third(&a.launch);
    let bump = [a.global.partner_bump];
    let seeds: &[&[u8]] = &[PARTNER_SEED, &bump];
    let before = a.partner_protocol.amount;
    cpi::cpmm_swap_base_input(&cpi::CpmmSwap {
        program: &a.pair.cpmm_program, payer: &a.partner.to_account_info(), authority: &a.pair.cpmm_authority, amm_config: &a.pq_amm_config, pool_state: &a.pq_pool,
        input_token_account: &a.partner_quote.to_account_info(), output_token_account: &a.partner_protocol.to_account_info(), input_vault: &a.pq_quote_vault, output_vault: &a.pq_protocol_vault,
        input_token_program: &a.quote_token_program, output_token_program: &a.protocol_token_program, input_token_mint: &a.quote_mint, output_token_mint: &a.protocol_mint, observation_state: &a.pq_observation,
    }, quote, 1, seeds)?;
    ctx.accounts.partner_protocol.reload()?;
    let protocol_got = ctx.accounts.partner_protocol.amount - before;
    let a = &ctx.accounts;
    let base = base_for(&a.launch, quote)?;
    cpmm_init(&a.pair, &a.partner.to_account_info(), a.launch.base_mint, a.global.protocol_mint, base, protocol_got, seeds)?;
    let l = &mut ctx.accounts.launch;
    l.quote_spent += quote;
    l.protocol_pair = ctx.accounts.pair.pool_state.key();
    l.step = Step::ProtocolPaired;
    Ok(())
}
