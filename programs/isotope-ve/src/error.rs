use anchor_lang::prelude::*;

#[error_code]
pub enum VeError {
    #[msg("amount must be > 0")]
    Zero,
    #[msg("lock duration out of range")]
    BadDuration,
    #[msg("lock has not expired")]
    LockActive,
    #[msg("lock has expired; withdraw it")]
    LockExpired,
    #[msg("vote weight exceeds remaining lock power for this epoch")]
    InsufficientPower,
    #[msg("epoch has not ended")]
    EpochOpen,
    #[msg("already claimed")]
    AlreadyClaimed,
    #[msg("nothing to claim")]
    NothingToClaim,
    #[msg("epoch had votes; nothing to sweep")]
    EpochHadVotes,
    #[msg("account does not match expected key or layout")]
    InvalidAccount,
    #[msg("math overflow")]
    Overflow,
    #[msg("swap output below the pool-implied minimum")]
    Slippage,
    #[msg("bps must be <= 10000")]
    BadBps,
    #[msg("unauthorized")]
    Unauthorized,
}
