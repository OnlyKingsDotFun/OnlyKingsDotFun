use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace, Default)]
pub struct Global {
    pub bump: u8,
    pub partner_bump: u8,
    /// protocol token every newmeme gets paired against
    pub protocol_mint: Pubkey,
    /// cp-swap fork program and the fee tier (AmmConfig) used for the two new pairs
    pub cpmm_program: Pubkey,
    pub cpmm_config: Pubkey,
    /// Meteora programs
    pub dbc_program: Pubkey,
    pub damm_v2_program: Pubkey,
    pub padding: [u64; 8],
}

/// One per (quote mint): our DBC config and the launch multipool newmemes join.
#[account]
#[derive(InitSpace, Default)]
pub struct QuoteLaunchConfig {
    pub bump: u8,
    pub quote_mint: Pubkey,
    /// our DBC `PoolConfig` for this quote
    pub dbc_config: Pubkey,
    /// cp-swap collection (rule LaunchpadDbc, program_id = partner) and its bound pool
    pub collection: Pubkey,
    pub collection_pool: Pubkey,
    /// protocol/quote cp-swap pool used to buy the protocol token in step 3
    pub protocol_quote_pool: Pubkey,
    pub padding: [u64; 8],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace, Default)]
#[borsh(use_discriminant = true)]
#[repr(u8)]
pub enum Step {
    #[default]
    Created = 0,
    Unwound = 1,
    QuotePaired = 2,
    ProtocolPaired = 3,
    Joined = 4,
}

#[account]
#[derive(InitSpace, Default)]
pub struct Launch {
    pub bump: u8,
    pub step: Step,
    pub quote_mint: Pubkey,
    pub base_mint: Pubkey,
    pub virtual_pool: Pubkey,
    pub dbc_config: Pubkey,
    /// DAMM v2 pool the curve migrated into
    pub damm_pool: Pubkey,
    /// quote received when the partner position was unwound; each step spends quote_total / 3
    pub quote_total: u64,
    pub quote_spent: u64,
    pub base_total: u64,
    /// pools created by the crank
    pub quote_pair: Pubkey,
    pub protocol_pair: Pubkey,
    pub padding: [u64; 8],
}
