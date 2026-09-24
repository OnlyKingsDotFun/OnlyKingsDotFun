use pinocchio::error::ProgramError;

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
#[repr(u32)]
pub enum AmmError {
    Unauthorized = 6000,
    InvalidPda,
    InvalidState,
    Arithmetic,
    InvalidAmount,
    InvalidTokenCount,
    DuplicateMint,
    UnsupportedToken,
    InvalidVault,
    InvalidFee,
    SlippageExceeded,
    Disabled,
    NotOpen,
    AlreadyInitialized,
    SameToken,
    IndexOutOfRange,
    /// Rebalance swap must strictly reduce imbalance.
    NotRebalancing,
    ReserveMismatch,
    InvalidCurve,
    ConvergenceFailed,
    ZeroLiquidity,
}

impl From<AmmError> for ProgramError {
    fn from(e: AmmError) -> Self {
        Self::Custom(e as u32)
    }
}

pub type Result<T> = core::result::Result<T, ProgramError>;
