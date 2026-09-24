use borsh::{BorshDeserialize, BorshSerialize};
use pinocchio::Address;

pub const ROOT_SEED: &[u8] = b"creator";
pub const INBOX_SEED: &[u8] = b"inbox";
pub const UNWRAP_SEED: &[u8] = b"unwrap";
pub const VERSION: u8 = 1;
pub type Key = [u8; 32];

// Pinned upstream identities, not caller-selected executable accounts.
pub const SANCTUM: Address = Address::from_str_const("SP12tWFxD9oJsVWNavTTBZvMbA6gkAmxtVgxdqvyvhY");
pub const STAKE: Address = Address::from_str_const("Stake11111111111111111111111111111111111111");
pub const LAUNCHLAB: Address =
    Address::from_str_const("LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj");
pub const STONK_STANDARD: Address =
    Address::from_str_const("4E876qZTE9FJMrBzgVtBrSrzz2TLivB5Y5QXPjB4gZL7");
pub const STONK_SOL_CONFIG: Address =
    Address::from_str_const("6s1xP3hpbAfFoNtUNF8mfHsjr2Bd97JxFJRWLbL6aHuX");
pub const WSOL: Address = Address::from_str_const("So11111111111111111111111111111111111111112");
pub const TOKEN_2022: Address =
    Address::from_str_const("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
pub const ATA: Address = Address::from_str_const("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
pub const LAUNCH_POOL_TAG: [u8; 8] = [247, 237, 227, 245, 215, 195, 222, 70];

pub trait State: BorshSerialize + BorshDeserialize {
    const TAG: [u8; 8];
    const SPACE: usize;
}

#[derive(BorshSerialize, BorshDeserialize, Debug, PartialEq, Eq)]
pub struct Creator {
    pub version: u8,
    pub bump: u8,
    pub stake_pool: Key,
    pub reserve: Key,
    pub lst_mint: Key,
    /// Sum of SOL actually forwarded by this program, including donations.
    pub contributed_lamports: u128,
}
impl State for Creator {
    const TAG: [u8; 8] = *b"OKCREATE";
    const SPACE: usize = 8 + 2 + 32 * 3 + 16;
}

#[derive(BorshSerialize, BorshDeserialize, Debug, PartialEq, Eq)]
pub struct Inbox {
    pub version: u8,
    pub bump: u8,
    pub creator: Key,
    pub meme_mint: Key,
    pub launch_pool: Key,
    pub contributed_lamports: u128,
}
impl State for Inbox {
    const TAG: [u8; 8] = *b"OKINBOX1";
    const SPACE: usize = 8 + 2 + 32 * 3 + 16;
}
