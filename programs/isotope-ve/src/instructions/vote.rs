use crate::{error::VeError, state::*, CONFIG_SEED, GAUGE_EPOCH_SEED, GAUGE_SEED, LOCK_SEED, VOTE_SEED};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

#[derive(Accounts)]
#[instruction(weight: u64)]
pub struct CastVote<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, VeConfig>>,
    #[account(mut, seeds = [LOCK_SEED, owner.key().as_ref()], bump = lock.bump, has_one = owner)]
    pub lock: Box<Account<'info, Lock>>,
    #[account(seeds = [GAUGE_SEED, gauge.collection.as_ref()], bump = gauge.bump)]
    pub gauge: Box<Account<'info, Gauge>>,
    /// current epoch's tally; the client derives the epoch from config + clock
    #[account(init_if_needed, payer = owner, space = 8 + GaugeEpoch::INIT_SPACE, seeds = [GAUGE_EPOCH_SEED, gauge.key().as_ref(), &config.current_epoch(Clock::get()?.unix_timestamp)?.to_le_bytes()], bump)]
    pub gauge_epoch: Box<Account<'info, GaugeEpoch>>,
    #[account(init, payer = owner, space = 8 + Vote::INIT_SPACE, seeds = [VOTE_SEED, lock.key().as_ref(), gauge.key().as_ref(), &config.current_epoch(Clock::get()?.unix_timestamp)?.to_le_bytes()], bump)]
    pub vote: Box<Account<'info, Vote>>,
    pub system_program: Program<'info, System>,
}

pub fn vote(ctx: Context<CastVote>, weight: u64) -> Result<()> {
    require_gt!(weight, 0, VeError::Zero);
    let now = Clock::get()?.unix_timestamp;
    let c = &ctx.accounts.config;
    let epoch = c.current_epoch(now)?;
    let power = ctx.accounts.lock.power(now, c.max_lock_secs);
    let l = &mut ctx.accounts.lock;
    if l.vote_epoch != epoch {
        l.vote_epoch = epoch;
        l.vote_used = 0;
    }
    let used = l.vote_used.checked_add(weight).ok_or(VeError::Overflow)?;
    require!(used <= power, VeError::InsufficientPower);
    l.vote_used = used;

    let ge = &mut ctx.accounts.gauge_epoch;
    if ge.gauge == Pubkey::default() {
        ge.bump = ctx.bumps.gauge_epoch;
        ge.gauge = ctx.accounts.gauge.key();
        ge.epoch = epoch;
    }
    ge.total_weight = ge.total_weight.checked_add(weight).ok_or(VeError::Overflow)?;

    let v = &mut ctx.accounts.vote;
    v.bump = ctx.bumps.vote;
    v.lock = ctx.accounts.lock.key();
    v.owner = ctx.accounts.owner.key();
    v.gauge = ctx.accounts.gauge.key();
    v.epoch = epoch;
    v.weight = weight;
    Ok(())
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, VeConfig>>,
    #[account(seeds = [GAUGE_SEED, gauge.collection.as_ref()], bump = gauge.bump, has_one = quote_mint, has_one = vault)]
    pub gauge: Box<Account<'info, Gauge>>,
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, seeds = [GAUGE_EPOCH_SEED, gauge.key().as_ref(), &vote.epoch.to_le_bytes()], bump = gauge_epoch.bump)]
    pub gauge_epoch: Box<Account<'info, GaugeEpoch>>,
    #[account(mut, close = owner, seeds = [VOTE_SEED, vote.lock.as_ref(), gauge.key().as_ref(), &vote.epoch.to_le_bytes()], bump = vote.bump, has_one = owner, has_one = gauge)]
    pub vote: Box<Account<'info, Vote>>,
    #[account(mut)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = quote_mint)]
    pub destination: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn claim(ctx: Context<Claim>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let current = ctx.accounts.config.current_epoch(now)?;
    let v = &ctx.accounts.vote;
    require!(v.epoch < current, VeError::EpochOpen);
    require!(!v.claimed, VeError::AlreadyClaimed);
    let ge = &mut ctx.accounts.gauge_epoch;
    require_gt!(ge.total_weight, 0, VeError::NothingToClaim);
    let payout = ((ge.fees as u128) * (v.weight as u128) / (ge.total_weight as u128)) as u64;
    // rounding dust from the last claimant stays in the vault and rolls into later sweeps
    require_gt!(payout, 0, VeError::NothingToClaim);
    ge.claimed = ge.claimed.checked_add(payout).ok_or(VeError::Overflow)?;
    let g = &ctx.accounts.gauge;
    let seeds: &[&[u8]] = &[GAUGE_SEED, g.collection.as_ref(), &[g.bump]];
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            TransferChecked { from: ctx.accounts.vault.to_account_info(), mint: ctx.accounts.quote_mint.to_account_info(), to: ctx.accounts.destination.to_account_info(), authority: ctx.accounts.gauge.to_account_info() },
            &[seeds],
        ),
        payout,
        ctx.accounts.quote_mint.decimals,
    )
    // `vote` is closed by the constraint; a closed vote cannot be claimed twice
}

#[derive(Accounts)]
pub struct SweepUnvoted<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, VeConfig>>,
    #[account(seeds = [GAUGE_SEED, gauge.collection.as_ref()], bump = gauge.bump)]
    pub gauge: Box<Account<'info, Gauge>>,
    /// an ended epoch with fees but no votes
    #[account(mut, seeds = [GAUGE_EPOCH_SEED, gauge.key().as_ref(), &stale.epoch.to_le_bytes()], bump = stale.bump, has_one = gauge)]
    pub stale: Box<Account<'info, GaugeEpoch>>,
    #[account(init_if_needed, payer = payer, space = 8 + GaugeEpoch::INIT_SPACE, seeds = [GAUGE_EPOCH_SEED, gauge.key().as_ref(), &config.current_epoch(Clock::get()?.unix_timestamp)?.to_le_bytes()], bump)]
    pub current: Box<Account<'info, GaugeEpoch>>,
    pub system_program: Program<'info, System>,
}

pub fn sweep_unvoted(ctx: Context<SweepUnvoted>) -> Result<()> {
    let epoch = ctx.accounts.config.current_epoch(Clock::get()?.unix_timestamp)?;
    let stale = &mut ctx.accounts.stale;
    require!(stale.epoch < epoch, VeError::EpochOpen);
    require_eq!(stale.total_weight, 0, VeError::EpochHadVotes);
    let amount = stale.fees;
    require_gt!(amount, 0, VeError::NothingToClaim);
    stale.fees = 0;
    let cur = &mut ctx.accounts.current;
    if cur.gauge == Pubkey::default() {
        cur.bump = ctx.bumps.current;
        cur.gauge = ctx.accounts.gauge.key();
        cur.epoch = epoch;
    }
    cur.fees = cur.fees.checked_add(amount).ok_or(VeError::Overflow)?;
    Ok(())
}
