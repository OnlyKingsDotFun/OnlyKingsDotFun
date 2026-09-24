#![allow(unexpected_cfgs)]
//! Isotope launchpad crank.
//!
//! Launches happen on Meteora's dynamic bonding curve with a `PoolConfig` whose `fee_claimer` and
//! `leftover_receiver` are this program's `partner` PDA and whose liquidity split is 50% partner
//! (liquid) / 50% creator (permanently locked). When the curve completes, Meteora migrates it to a
//! DAMM v2 pool and hands the partner half to `partner` as a position NFT. Anyone then runs the crank,
//! one idempotent step per transaction:
//!
//! 1. `unwind`: claim fees, remove all liquidity from the partner position, close it. Partner now
//!    holds `quote_total` quote and `base_total` newmeme.
//! 2. `pair_quote`: cp-swap `initialize` newmeme/quote with quote_total/3 and the proportional newmeme.
//! 3. `pair_protocol`: swap quote_total/3 into the protocol token on the protocol/quote pair, then
//!    cp-swap `initialize` newmeme/protocol-token.
//! 4. `join_multipool`: swap the last quote_total/3 into newmeme through the pair from step 2, register
//!    newmeme in the launch collection (`LaunchpadDbc` rule, proof = DBC virtual pool + config), add it
//!    as a member of the quote's launch multipool and deposit every remaining newmeme into its vault.
//!
//! The DBC `PoolConfig` itself is created off-chain by the admin (its signer is the config keypair);
//! `init_launch` records which configs are ours. LP tokens from steps 2 and 3 stay with `partner` as
//! protocol-owned liquidity, withdrawable by the admin.

use anchor_lang::prelude::*;

pub mod cpi;
pub mod error;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("LNCHrLBqZpUmvvB7Nn5VZbdD5mW9WVWdU1Hs2k9bKqm");

pub mod admin {
    use super::{pubkey, Pubkey};
    #[cfg(feature = "localnet")]
    pub const ID: Pubkey = Pubkey::from_str_const(env!("ISOTOPE_LAUNCH_ADMIN"));
    #[cfg(not(feature = "localnet"))]
    pub const ID: Pubkey = pubkey!("tEST7VtgmRM2rLW5FS4tGRvsb2jpL1X4eJvVyDTtTWg");
}

pub const PARTNER_SEED: &[u8] = b"partner";
pub const LAUNCH_SEED: &[u8] = b"launch";
pub const GLOBAL_SEED: &[u8] = b"global";

#[program]
pub mod isotope_launch {
    use super::*;

    /// Admin: record the protocol token, the cp-swap fee tier new pairs use, and the launch
    /// collection (one per quote mint) that newmemes join.
    pub fn init_global(ctx: Context<InitGlobal>, params: GlobalParams) -> Result<()> {
        instructions::init_global(ctx, params)
    }
    /// Admin: change the protocol mint (the launch-time "pending" token becomes the real one).
    pub fn set_protocol_mint(ctx: Context<SetProtocolMint>) -> Result<()> {
        instructions::set_protocol_mint(ctx)
    }
    /// Admin: whitelist one of our DBC configs (fee_claimer must be `partner`) and the launch
    /// multipool for its quote mint.
    pub fn register_quote(ctx: Context<RegisterQuote>) -> Result<()> {
        instructions::register_quote(ctx)
    }
    /// Permissionless: open the per-launch state for a migrated DBC pool on one of our configs.
    pub fn init_launch(ctx: Context<InitLaunch>) -> Result<()> {
        instructions::init_launch(ctx)
    }
    /// Step 1: claim fees, remove all liquidity from the partner's DAMM v2 position, close it.
    pub fn unwind<'info>(ctx: Context<'info, Unwind<'info>>) -> Result<()> {
        instructions::unwind(ctx)
    }
    /// Step 2: cp-swap newmeme/quote pair with a third of the quote.
    pub fn pair_quote<'info>(ctx: Context<'info, PairQuote<'info>>) -> Result<()> {
        instructions::pair_quote(ctx)
    }
    /// Step 3: swap a third of the quote to the protocol token, cp-swap newmeme/protocol pair.
    pub fn pair_protocol<'info>(ctx: Context<'info, PairProtocol<'info>>) -> Result<()> {
        instructions::pair_protocol(ctx)
    }
    /// Step 4: swap the last third into newmeme via the quote pair, register in the launch
    /// collection, add to the multipool, deposit all remaining newmeme.
    pub fn join_multipool<'info>(ctx: Context<'info, JoinMultipool<'info>>) -> Result<()> {
        instructions::join_multipool(ctx)
    }
    /// Admin: move protocol-owned LP or leftover tokens out of the partner PDA.
    pub fn withdraw_partner(ctx: Context<WithdrawPartner>, amount: u64) -> Result<()> {
        instructions::withdraw_partner(ctx, amount)
    }
}
