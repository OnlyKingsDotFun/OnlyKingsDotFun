use borsh::{BorshDeserialize, BorshSerialize};

pub type Key = [u8; 32];
pub const VERSION: u8 = 1;
pub const MAX_TOKENS: usize = 8;
pub const MIN_TOKENS: usize = 2;
/// Raydium convention: fee rates are parts per million.
pub const FEE_DENOM: u64 = 1_000_000;
pub const MAX_TRADE_FEE: u64 = 100_000; // 10%
/// Rates are 1e9 = 1.0 (e.g. an LST worth 1.15 SOL has rate 1_150_000_000).
pub const RATE_ONE: u64 = 1_000_000_000;
pub const LP_DECIMALS: u8 = 9;
/// First-deposit LP units permanently locked (Raydium locks 100).
pub const LOCKED_LP: u64 = 100;
pub const AUTH_SEED: &[u8] = b"vault_and_lp_mint_auth_seed";
pub const CONFIG_SEED: &[u8] = b"amm_config";
pub const POOL_SEED: &[u8] = b"pool";
pub const LP_MINT_SEED: &[u8] = b"pool_lp_mint";
pub const VAULT_SEED: &[u8] = b"pool_vault";

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
#[repr(u8)]
pub enum Curve {
    /// Equal-weight geometric-mean invariant; any pair trades at x*y=k on its two reserves.
    ConstantProduct = 0,
    /// Curve StableSwap over all N rate-normalised reserves.
    Stable = 1,
}

pub trait State: BorshSerialize + BorshDeserialize + Default {
    const TAG: [u8; 8];
    const SPACE: usize;
}

#[derive(BorshSerialize, BorshDeserialize, Debug, Default, Clone)]
pub struct AmmConfig {
    pub version: u8,
    pub bump: u8,
    pub index: u16,
    pub owner: Key,
    pub trade_fee_rate: u64,
    pub protocol_fee_rate: u64,
    pub fund_fee_rate: u64,
    /// Rebalance swaps pay trade_fee_rate / rebalance_fee_divisor.
    pub rebalance_fee_divisor: u32,
    pub disable_create_pool: bool,
}
impl State for AmmConfig {
    const TAG: [u8; 8] = *b"CAMMCFG1";
    const SPACE: usize = 8 + 1 + 1 + 2 + 32 + 8 + 8 + 8 + 4 + 1;
}

pub const STATUS_DEPOSIT_OFF: u8 = 1;
pub const STATUS_WITHDRAW_OFF: u8 = 2;
pub const STATUS_SWAP_OFF: u8 = 4;

#[derive(BorshSerialize, BorshDeserialize, Debug, Default, Clone)]
pub struct PoolState {
    pub version: u8,
    pub bump: u8,
    pub auth_bump: u8,
    pub status: u8,
    pub curve: u8,
    pub n: u8,
    pub amm_config: Key,
    pub creator: Key,
    pub rate_authority: Key,
    pub lp_mint: Key,
    pub nonce: u64,
    pub amp: u64,
    pub open_time: u64,
    pub lp_supply: u64,
    pub mints: [Key; MAX_TOKENS],
    pub vaults: [Key; MAX_TOKENS],
    pub decimals: [u8; MAX_TOKENS],
    /// Cached reserves owned by LPs (excludes fees owed). Vault balance must be >= sum.
    pub reserves: [u64; MAX_TOKENS],
    pub rates: [u64; MAX_TOKENS],
    pub protocol_fees_owed: [u64; MAX_TOKENS],
    pub fund_fees_owed: [u64; MAX_TOKENS],
}
impl State for PoolState {
    const TAG: [u8; 8] = *b"CAMMPOOL";
    const SPACE: usize = 8 + 6 + 32 * 4 + 8 * 4 + 32 * 8 * 2 + 8 + 8 * 8 * 4;
}
impl PoolState {
    pub fn n(&self) -> usize {
        self.n as usize
    }
    pub fn curve(&self) -> Curve {
        if self.curve == Curve::Stable as u8 {
            Curve::Stable
        } else {
            Curve::ConstantProduct
        }
    }
}
