use crate::{cpi, error::VeError, instructions::fees::credit_epoch, state::*, CONFIG_SEED, GAUGE_EPOCH_SEED, GAUGE_SEED, ROUTE_SEED, TREASURY_SEED};
use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked}};

#[derive(Accounts)]
pub struct Recycle<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = proto_mint, has_one = cpmm_program)]
    pub config: Box<Account<'info, VeConfig>>,
    #[account(seeds = [ROUTE_SEED, quote_mint.key().as_ref()], bump = route.bump, has_one = gauge, has_one = pol_pool)]
    pub route: Box<Account<'info, QuoteRoute>>,
    /// CHECK: PDA that owns treasury token accounts
    #[account(mut, seeds = [TREASURY_SEED], bump = config.treasury_bump)]
    pub treasury: UncheckedAccount<'info>,
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    pub proto_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = quote_mint, token::authority = treasury)]
    pub treasury_quote: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(init_if_needed, payer = payer, associated_token::mint = proto_mint, associated_token::authority = treasury, associated_token::token_program = token_program)]
    pub treasury_proto: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(init_if_needed, payer = payer, associated_token::mint = lp_mint, associated_token::authority = treasury, associated_token::token_program = token_program)]
    pub treasury_lp: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, seeds = [GAUGE_SEED, gauge.collection.as_ref()], bump = gauge.bump, has_one = quote_mint, has_one = vault)]
    pub gauge: Box<Account<'info, Gauge>>,
    #[account(init_if_needed, payer = payer, space = 8 + GaugeEpoch::INIT_SPACE, seeds = [GAUGE_EPOCH_SEED, gauge.key().as_ref(), &config.current_epoch(Clock::get()?.unix_timestamp)?.to_le_bytes()], bump)]
    pub gauge_epoch: Box<Account<'info, GaugeEpoch>>,
    #[account(mut)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: cp-swap
    pub cpmm_program: UncheckedAccount<'info>,
    /// CHECK: cp-swap vault/lp authority
    pub cpmm_authority: UncheckedAccount<'info>,
    /// CHECK: verified against pool_state in handler
    pub amm_config: UncheckedAccount<'info>,
    /// CHECK: PROTO/quote pool, pinned by the route
    #[account(mut)]
    pub pol_pool: UncheckedAccount<'info>,
    #[account(mut)]
    pub vault_0: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub vault_1: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub lp_mint: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK
    #[account(mut)]
    pub observation: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    /// CHECK: token-2022 program, passed through to cp-swap deposit
    pub token_program_2022: UncheckedAccount<'info>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

struct Pool { amm_config: Pubkey, v0: Pubkey, v1: Pubkey, lp_mint: Pubkey, m0: Pubkey, m1: Pubkey, tp0: Pubkey, tp1: Pubkey, obs: Pubkey, lp_supply: u64, fees0: u64, fees1: u64 }
fn read_pool(acc: &AccountInfo) -> Result<Pool> {
    let d = acc.try_borrow_data()?;
    require!(d.len() >= cpi::POOL_CREATOR_FEES_1 + 8, VeError::InvalidAccount);
    let fees0 = cpi::u64_at(&d, cpi::POOL_PROTOCOL_FEES_0) + cpi::u64_at(&d, cpi::POOL_FUND_FEES_0) + cpi::u64_at(&d, cpi::POOL_CREATOR_FEES_0);
    let fees1 = cpi::u64_at(&d, cpi::POOL_PROTOCOL_FEES_1) + cpi::u64_at(&d, cpi::POOL_FUND_FEES_1) + cpi::u64_at(&d, cpi::POOL_CREATOR_FEES_1);
    Ok(Pool {
        amm_config: cpi::pk(&d, cpi::POOL_AMM_CONFIG), v0: cpi::pk(&d, cpi::POOL_VAULT_0), v1: cpi::pk(&d, cpi::POOL_VAULT_1), lp_mint: cpi::pk(&d, cpi::POOL_LP_MINT),
        m0: cpi::pk(&d, cpi::POOL_MINT_0), m1: cpi::pk(&d, cpi::POOL_MINT_1), tp0: cpi::pk(&d, cpi::POOL_TP_0), tp1: cpi::pk(&d, cpi::POOL_TP_1), obs: cpi::pk(&d, cpi::POOL_OBSERVATION),
        lp_supply: cpi::u64_at(&d, cpi::POOL_LP_SUPPLY), fees0, fees1,
    })
}

pub fn recycle<'info>(ctx: Context<'info, Recycle<'info>>) -> Result<()> {
    let a = &ctx.accounts;
    let now = Clock::get()?.unix_timestamp;
    let epoch = a.config.current_epoch(now)?;
    let tseeds: &[&[u8]] = &[TREASURY_SEED, &[a.config.treasury_bump]];

    let bal = a.treasury_quote.amount;
    require_gt!(bal, 0, VeError::Zero);
    let take = bal.min(a.config.recycle_cap);
    let gauge_share = ((take as u128) * (10_000 - a.route.pol_bps as u128) / 10_000) as u64;
    let pol = take - gauge_share;

    if gauge_share > 0 {
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                a.token_program.key(),
                TransferChecked { from: a.treasury_quote.to_account_info(), mint: a.quote_mint.to_account_info(), to: a.vault.to_account_info(), authority: a.treasury.to_account_info() },
                &[tseeds],
            ),
            gauge_share,
            a.quote_mint.decimals,
        )?;
    }
    if pol < 2 {
        credit_epoch(&mut ctx.accounts.gauge_epoch, ctx.bumps.gauge_epoch, ctx.accounts.gauge.key(), epoch, gauge_share)?;
        ctx.accounts.gauge.lifetime_fees = ctx.accounts.gauge.lifetime_fees.saturating_add(gauge_share);
        return Ok(());
    }

    // ---- pool wiring ----
    let p = read_pool(&a.pol_pool)?;
    require_keys_eq!(p.amm_config, a.amm_config.key(), VeError::InvalidAccount);
    require_keys_eq!(p.v0, a.vault_0.key(), VeError::InvalidAccount);
    require_keys_eq!(p.v1, a.vault_1.key(), VeError::InvalidAccount);
    require_keys_eq!(p.lp_mint, a.lp_mint.key(), VeError::InvalidAccount);
    require_keys_eq!(p.obs, a.observation.key(), VeError::InvalidAccount);
    let quote_is_0 = p.m0 == a.quote_mint.key();
    if quote_is_0 { require_keys_eq!(p.m1, a.proto_mint.key(), VeError::InvalidAccount); } else { require_keys_eq!(p.m0, a.proto_mint.key(), VeError::InvalidAccount); require_keys_eq!(p.m1, a.quote_mint.key(), VeError::InvalidAccount); }
    let tp_of = |k: Pubkey| -> Result<AccountInfo<'info>> {
        if k == a.token_program.key() { Ok(a.token_program.to_account_info()) } else if k == a.token_program_2022.key() { Ok(a.token_program_2022.to_account_info()) } else { err!(VeError::InvalidAccount) }
    };
    let (quote_vault, proto_vault, quote_tp, proto_tp, quote_res, proto_res) = if quote_is_0 {
        (&a.vault_0, &a.vault_1, tp_of(p.tp0)?, tp_of(p.tp1)?, a.vault_0.amount - p.fees0, a.vault_1.amount - p.fees1)
    } else {
        (&a.vault_1, &a.vault_0, tp_of(p.tp1)?, tp_of(p.tp0)?, a.vault_1.amount - p.fees1, a.vault_0.amount - p.fees0)
    };

    // ---- swap half the POL quote into PROTO, bounded by the pool's own pre-trade price ----
    let half = pol / 2;
    let trade_fee_rate = { let d = a.amm_config.try_borrow_data()?; require!(d.len() >= cpi::AMM_CONFIG_TRADE_FEE_RATE + 8, VeError::InvalidAccount); cpi::u64_at(&d, cpi::AMM_CONFIG_TRADE_FEE_RATE) as u128 };
    let fee = ((half as u128) * trade_fee_rate + cpi::FEE_RATE_DENOMINATOR - 1) / cpi::FEE_RATE_DENOMINATOR;
    let in_net = half as u128 - fee;
    let expected = (proto_res as u128) * in_net / (quote_res as u128 + in_net);
    let min_out = (expected * (10_000 - a.config.recycle_slippage_bps as u128) / 10_000) as u64;
    require_gt!(min_out, 0, VeError::Slippage);
    cpi::cpmm_swap_base_input(
        &cpi::CpmmSwap {
            program: &a.cpmm_program, payer: &a.treasury, authority: &a.cpmm_authority, amm_config: &a.amm_config, pool_state: &a.pol_pool,
            input_token_account: &a.treasury_quote.to_account_info(), output_token_account: &a.treasury_proto.to_account_info(),
            input_vault: &quote_vault.to_account_info(), output_vault: &proto_vault.to_account_info(),
            input_token_program: &quote_tp, output_token_program: &proto_tp, input_token_mint: &a.quote_mint.to_account_info(), output_token_mint: &a.proto_mint.to_account_info(),
            observation_state: &a.observation,
        },
        half, min_out, tseeds,
    )?;

    // ---- deposit both sides ----
    ctx.accounts.treasury_proto.reload()?;
    ctx.accounts.vault_0.reload()?;
    ctx.accounts.vault_1.reload()?;
    let a = &ctx.accounts;
    let p = read_pool(&a.pol_pool)?;
    let (quote_res, proto_res) = if quote_is_0 { (a.vault_0.amount - p.fees0, a.vault_1.amount - p.fees1) } else { (a.vault_1.amount - p.fees1, a.vault_0.amount - p.fees0) };
    let quote_left = pol - half;
    let proto_got = a.treasury_proto.amount;
    let lp_q = (quote_left as u128) * (p.lp_supply as u128) / (quote_res as u128);
    let lp_p = (proto_got as u128) * (p.lp_supply as u128) / (proto_res as u128);
    let lp = lp_q.min(lp_p) as u64;
    require_gt!(lp, 0, VeError::Slippage);
    let (max_0, max_1) = if quote_is_0 { (quote_left, proto_got) } else { (proto_got, quote_left) };
    let (acc_0, acc_1) = if quote_is_0 { (a.treasury_quote.to_account_info(), a.treasury_proto.to_account_info()) } else { (a.treasury_proto.to_account_info(), a.treasury_quote.to_account_info()) };
    let (mint_0, mint_1) = if quote_is_0 { (a.quote_mint.to_account_info(), a.proto_mint.to_account_info()) } else { (a.proto_mint.to_account_info(), a.quote_mint.to_account_info()) };
    cpi::cpmm_deposit(
        &cpi::CpmmDeposit {
            program: &a.cpmm_program, owner: &a.treasury, authority: &a.cpmm_authority, pool_state: &a.pol_pool, owner_lp_token: &a.treasury_lp.to_account_info(),
            token_0_account: &acc_0, token_1_account: &acc_1, token_0_vault: &a.vault_0.to_account_info(), token_1_vault: &a.vault_1.to_account_info(),
            token_program: &a.token_program.to_account_info(), token_program_2022: &a.token_program_2022, vault_0_mint: &mint_0, vault_1_mint: &mint_1, lp_mint: &a.lp_mint.to_account_info(),
        },
        lp, max_0, max_1, tseeds,
    )?;

    credit_epoch(&mut ctx.accounts.gauge_epoch, ctx.bumps.gauge_epoch, ctx.accounts.gauge.key(), epoch, gauge_share)?;
    ctx.accounts.gauge.lifetime_fees = ctx.accounts.gauge.lifetime_fees.saturating_add(gauge_share);
    Ok(())
}

/// Collect creator fees from a cp-swap pool whose `pool_creator` is the treasury (LaunchLab sets
/// `platformCpCreator` there). Output lands in the treasury's ATAs; `recycle` picks it up.
#[derive(Accounts)]
pub struct HarvestCreatorFee<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = cpmm_program)]
    pub config: Box<Account<'info, VeConfig>>,
    /// CHECK: PDA; pays ATA rent inside cp-swap if needed
    #[account(mut, seeds = [TREASURY_SEED], bump = config.treasury_bump)]
    pub treasury: UncheckedAccount<'info>,
    /// CHECK
    pub cpmm_program: UncheckedAccount<'info>,
    /// CHECK
    pub cpmm_authority: UncheckedAccount<'info>,
    /// CHECK
    #[account(mut)]
    pub pool_state: UncheckedAccount<'info>,
    /// CHECK
    pub amm_config: UncheckedAccount<'info>,
    /// CHECK
    #[account(mut)]
    pub vault_0: UncheckedAccount<'info>,
    /// CHECK
    #[account(mut)]
    pub vault_1: UncheckedAccount<'info>,
    /// CHECK
    pub mint_0: UncheckedAccount<'info>,
    /// CHECK
    pub mint_1: UncheckedAccount<'info>,
    /// CHECK: treasury ATA for mint_0
    #[account(mut)]
    pub treasury_0: UncheckedAccount<'info>,
    /// CHECK: treasury ATA for mint_1
    #[account(mut)]
    pub treasury_1: UncheckedAccount<'info>,
    /// CHECK
    pub token_program_0: UncheckedAccount<'info>,
    /// CHECK
    pub token_program_1: UncheckedAccount<'info>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn harvest_creator_fee<'info>(ctx: Context<'info, HarvestCreatorFee<'info>>) -> Result<()> {
    let a = &ctx.accounts;
    {
        let d = a.pool_state.try_borrow_data()?;
        require!(d.len() >= cpi::POOL_CREATOR_FEES_1 + 8 && *a.pool_state.owner == a.config.cpmm_program, VeError::InvalidAccount);
        require_keys_eq!(cpi::pk(&d, cpi::POOL_CREATOR), a.treasury.key(), VeError::Unauthorized);
    }
    let tseeds: &[&[u8]] = &[TREASURY_SEED, &[a.config.treasury_bump]];
    cpi::cpmm_collect_creator_fee(
        &cpi::CpmmCollectCreatorFee {
            program: &a.cpmm_program, creator: &a.treasury, authority: &a.cpmm_authority, pool_state: &a.pool_state, amm_config: &a.amm_config,
            token_0_vault: &a.vault_0, token_1_vault: &a.vault_1, vault_0_mint: &a.mint_0, vault_1_mint: &a.mint_1, creator_token_0: &a.treasury_0, creator_token_1: &a.treasury_1,
            token_0_program: &a.token_program_0, token_1_program: &a.token_program_1, associated_token_program: &a.associated_token_program.to_account_info(), system_program: &a.system_program.to_account_info(),
        },
        tseeds,
    )
}
