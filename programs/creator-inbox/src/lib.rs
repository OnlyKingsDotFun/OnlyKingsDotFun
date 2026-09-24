//! Per-launch SOL contribution accounting. No minting, withdrawals or retargeting.
#![allow(unexpected_cfgs)]

mod processor;
pub mod state;

pub use processor::process_instruction;

#[cfg(not(feature = "no-entrypoint"))]
pinocchio::entrypoint!(process_instruction, 10);

/// Borsh instruction discriminants are stable; no trailing bytes are accepted.
#[derive(borsh::BorshDeserialize, borsh::BorshSerialize, Debug)]
pub enum Instruction {
    /// payer(s,w), manager(s), root(w), stake_pool, reserve, system_program
    InitializeCreator,
    /// payer(s,w), root, inbox(w), meme_mint, launchlab_pool, system_program
    RegisterStonk,
    /// root(w), inbox(w), stake_pool, reserve(w)
    SettleSol,
    /// root(w), inbox(w), stake_pool, reserve(w), payer(s,w),
    /// inbox_wsol_ata(w), unwrap_pda(w), wsol_mint, token_program, system_program
    SettleWsol,
}

#[repr(u32)]
#[derive(Debug, Clone, Copy)]
pub enum Error {
    InvalidAccount = 7000,
    InvalidPda,
    Unauthorized,
    NotWritable,
    AlreadyInitialized,
    InvalidState,
    InvalidStakePool,
    InvalidLaunch,
    InvalidTokenAccount,
    ArithmeticOverflow,
}
impl From<Error> for pinocchio::error::ProgramError {
    fn from(value: Error) -> Self {
        Self::Custom(value as u32)
    }
}
