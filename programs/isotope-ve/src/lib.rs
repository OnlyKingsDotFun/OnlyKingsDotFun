#![allow(unexpected_cfgs)]
//! Isotope ve(3,3) on top of Raydium cp-swap.
//!
//! * `Lock`: protocol tokens locked for up to `max_lock_secs`; power decays linearly.
//! * `Gauge`: one per cp-swap `TokenCollection`; fees arrive in the collection's quote mint.
//! * Votes are per epoch. Fees that arrive in epoch E are split among epoch-E voters of that gauge,
//!   claimable once E ends, paid in kind (the collection's quote). No emissions in this version.
//! * `treasury` PDA: creator / platform fee receiver on our LaunchLab platform config and the
//!   `pool_creator` of pools it migrates. `recycle` splits its quote inflows into protocol-owned
//!   PROTO/quote LP and the routed gauge's current epoch. Anyone can crank it; per-call size is capped.
//!
//! Nothing here needs Raydium's cooperation: it only holds LP tokens, signs cp-swap CPIs as an
//! ordinary user, and reads public account layouts.

use anchor_lang::prelude::*;

pub mod cpi;
pub mod error;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("VEEgcPaDDxbc3WBCTfkMLUxrhUzaiofJxw3Gh2RjFFT");

pub const CONFIG_SEED: &[u8] = b"config";
pub const ESCROW_SEED: &[u8] = b"escrow";
pub const TREASURY_SEED: &[u8] = b"treasury";
pub const LOCK_SEED: &[u8] = b"lock";
pub const GAUGE_SEED: &[u8] = b"gauge";
pub const GAUGE_EPOCH_SEED: &[u8] = b"gauge_epoch";
pub const VOTE_SEED: &[u8] = b"vote";
pub const ROUTE_SEED: &[u8] = b"route";

#[program]
pub mod isotope_ve {
    use super::*;

    /// Once: the vote token, the cp-swap program, epoch and lock parameters. Signer becomes admin.
    pub fn init_config(ctx: Context<InitConfig>, params: ConfigParams) -> Result<()> {
        instructions::init_config(ctx, params)
    }
    /// Admin: change recycle/lock parameters or hand over admin.
    pub fn update_config(ctx: Context<UpdateConfig>, params: UpdateParams) -> Result<()> {
        instructions::update_config(ctx, params)
    }
    /// Admin: where treasury inflows in `quote_mint` go (voter gauge + POL pool + split).
    pub fn set_route(ctx: Context<SetRoute>, pol_bps: u16) -> Result<()> {
        instructions::set_route(ctx, pol_bps)
    }
    /// Admin: move treasury-held tokens (LP or otherwise). The escape hatch; governance later.
    pub fn treasury_transfer(ctx: Context<TreasuryTransfer>, amount: u64) -> Result<()> {
        instructions::treasury_transfer(ctx, amount)
    }

    /// Permissionless: a gauge for a cp-swap `TokenCollection`.
    pub fn create_gauge(ctx: Context<CreateGauge>) -> Result<()> {
        instructions::create_gauge(ctx)
    }

    /// Lock `amount` protocol tokens until now + `duration`.
    pub fn create_lock(ctx: Context<CreateLock>, amount: u64, duration: i64) -> Result<()> {
        instructions::create_lock(ctx, amount, duration)
    }
    /// Add tokens to an unexpired lock.
    pub fn increase_lock(ctx: Context<ModifyLock>, amount: u64) -> Result<()> {
        instructions::increase_lock(ctx, amount)
    }
    /// Push `end` out to now + `duration` (must be later than the current end).
    pub fn extend_lock(ctx: Context<ExtendLock>, duration: i64) -> Result<()> {
        instructions::extend_lock(ctx, duration)
    }
    /// After expiry: take the tokens back.
    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        instructions::withdraw(ctx)
    }

    /// Spend `weight` of this epoch's power on a gauge. One vote per (lock, gauge, epoch).
    pub fn vote(ctx: Context<CastVote>, weight: u64) -> Result<()> {
        instructions::vote(ctx, weight)
    }
    /// After the epoch ends: this vote's share of the gauge's epoch fees, in the collection's quote.
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        instructions::claim(ctx)
    }
    /// Permissionless: fees of an ended epoch with zero votes roll into the current epoch.
    pub fn sweep_unvoted(ctx: Context<SweepUnvoted>) -> Result<()> {
        instructions::sweep_unvoted(ctx)
    }

    /// Permissionless: push quote tokens into a gauge's current epoch.
    pub fn deposit_fees(ctx: Context<DepositFees>, amount: u64) -> Result<()> {
        instructions::deposit_fees(ctx, amount)
    }
    /// Permissionless: split the treasury's balance of a routed quote into POL (swap half to PROTO,
    /// deposit both into the PROTO/quote pool) and the routed gauge's current epoch.
    pub fn recycle<'info>(ctx: Context<'info, Recycle<'info>>) -> Result<()> {
        instructions::recycle(ctx)
    }
    /// Permissionless: collect creator fees from a cp-swap pool whose creator is the treasury.
    pub fn harvest_creator_fee<'info>(ctx: Context<'info, HarvestCreatorFee<'info>>) -> Result<()> {
        instructions::harvest_creator_fee(ctx)
    }
}
