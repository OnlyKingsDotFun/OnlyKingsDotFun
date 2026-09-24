#![allow(unexpected_cfgs)]
//! Collection AMM: one pool, N constituents, one invariant.
//!
//! Structure follows Raydium cp-swap (AmmConfig -> PoolState -> vaults + LP mint, a global
//! authority PDA, protocol/fund fee split) generalised to 2..=8 tokens with two curves:
//! equal-weight constant product (geometric mean, pairwise swaps are exactly CPMM) and
//! N-coin StableSwap (Curve get_D/get_y). Two swap paths share the curve: `Swap` (standard
//! fee) and `RebalanceSwap` (fee / divisor, only allowed if it strictly reduces the pool's
//! deviation from equal rate-adjusted value across constituents).

pub mod accounts;
pub mod error;
pub mod instruction;
pub mod math;
pub mod processor;
pub mod state;
pub mod tokens;

#[cfg(not(feature = "no-entrypoint"))]
pinocchio::entrypoint!(processor::process_instruction, 40);
