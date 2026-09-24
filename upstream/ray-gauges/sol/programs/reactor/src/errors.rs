use anchor_lang::prelude::*;

#[error_code]
pub enum ReactorErrors {
    #[msg("isoRAY balance is not up-to-date")]
    IsoRayNotUpToDate,

    #[msg("Insufficient RAY balance for withdrawal")]
    InsufficientRayBalance,

    #[msg("Isufficient RAY to pledge")]
    InsufficientRayToPledge,

    #[msg("Insufficient RAY to unpledge")]
    InsufficientRayToUnpledge,

    #[msg("Insufficient votes to lock")]
    InsufficientVotesToLock,

    #[msg("Insufficient votes to unlock")]
    InsufficientVotesToUnlock,

    #[msg("Insufficient unlocked votes to withdraw")]
    InsufficientVotesToWithdraw,

    #[msg("Not admin")]
    NotAdmin,
}
