use anchor_lang::prelude::*;

#[error_code]
pub enum LaunchError {
    #[msg("Not authorized")]
    NotApproved,
    #[msg("DBC config fee_claimer is not the partner PDA")]
    ConfigNotOurs,
    #[msg("DBC config leftover_receiver is not the partner PDA")]
    LeftoverNotOurs,
    #[msg("Virtual pool does not belong to this config")]
    PoolConfigMismatch,
    #[msg("Virtual pool has not migrated yet")]
    NotMigrated,
    #[msg("Launch is not at the expected step")]
    WrongStep,
    #[msg("Quote mint mismatch")]
    QuoteMismatch,
    #[msg("Base mint mismatch")]
    BaseMismatch,
    #[msg("Position does not belong to the migrated pool or the partner")]
    InvalidPosition,
    #[msg("Position is not a liquid partner position")]
    PositionLocked,
    #[msg("Unexpected account")]
    InvalidAccount,
    #[msg("Math overflow")]
    Math,
    #[msg("Nothing to withdraw")]
    Empty,
}
