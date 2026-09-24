use anchor_lang::prelude::*;

// CP-Swap account types from the published IDL (idls/raydium_cp_swap.json); no crate dependency.
declare_program!(raydium_cp_swap);

mod clock;
mod instructions;
pub mod state;

use instructions::*;

/// Seed for pool-specific time tracker PDAs
pub const TIME_TRACKER_SEED: &[u8] = b"time-tracker";

/// Used to generate escrow token account for LP tokens
pub const LP_ESCROW_SEED: &[u8] = b"escrow";

/// Used for generating personal positions
pub const PERSONAL_POSITION_SEED: &[u8] = b"personal-position";

declare_id!("9GXRUvyuS444wsgY7uXJqtJjb5XHXCBd4hCZD83nAD42");

#[program]
pub mod cp_lp_escrow {
    use super::*;

    /// Init an escrow account for a pool
    pub fn init_escrow(ctx: Context<InitEscrow>) -> Result<()> {
        init_escrow::handler(ctx)
    }

    /// Init a personal position for a user
    pub fn init_personal_position(ctx: Context<InitPersonalPosition>) -> Result<()> {
        init_personal_position::handler(ctx)
    }

    /// Deposit LP tokens into the escrow for the user
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        deposit::handler(ctx, amount)
    }

    /// Withdraw LP tokens from the escrow for the user
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        withdraw::handler(ctx, amount)
    }

    /// Sync the personal position with the time tracker
    pub fn update_personal_position(ctx: Context<UpdatePersonalPosition>) -> Result<()> {
        update_personal_position::handler(ctx)
    }
}
