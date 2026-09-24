use crate::state::{Key, MAX_TOKENS};
use borsh::{BorshDeserialize, BorshSerialize};

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub enum AmmInstruction {
    /// [owner(s,w), amm_config(w), system_program]
    CreateAmmConfig {
        index: u16,
        trade_fee_rate: u64,
        protocol_fee_rate: u64,
        fund_fee_rate: u64,
        rebalance_fee_divisor: u32,
    },
    /// [owner(s), amm_config(w)] param: 0 trade, 1 protocol, 2 fund, 3 rebalance divisor, 4 disable_create_pool
    UpdateAmmConfig { param: u8, value: u64 },
    /// [owner(s), amm_config(w)]
    SetConfigOwner { new_owner: Key },
    /// [creator(s,w), amm_config, authority, pool(w), lp_mint(w), lp_token_program, system_program,
    ///  token_program, token_2022_program, then n x (mint, vault(w))]
    InitializePool {
        nonce: u64,
        curve: u8,
        amp: u64,
        open_time: u64,
        n: u8,
        rates: [u64; MAX_TOKENS],
    },
    /// [owner(s), authority, pool(w), lp_mint(w), owner_lp(w), lp_token_program, token_program,
    ///  token_2022_program, then n x (mint, owner_token(w), vault(w))]
    /// First deposit: `max_amounts` are the exact amounts and `lp_amount` is ignored.
    Deposit { lp_amount: u64, max_amounts: [u64; MAX_TOKENS] },
    /// Same accounts as Deposit.
    Withdraw { lp_amount: u64, min_amounts: [u64; MAX_TOKENS] },
    /// [owner(s), authority, amm_config, pool(w), token_program, token_2022_program,
    ///  in_mint, owner_in(w), vault_in(w), out_mint, owner_out(w), vault_out(w)]
    Swap { in_index: u8, out_index: u8, amount_in: u64, min_amount_out: u64 },
    /// Same accounts as Swap. Discounted fee; must strictly reduce imbalance.
    RebalanceSwap { in_index: u8, out_index: u8, amount_in: u64, min_amount_out: u64 },
    /// [rate_authority(s), pool(w)]
    UpdateRates { rates: [u64; MAX_TOKENS] },
    /// [rate_authority(s), pool(w)]
    SetRateAuthority { new_authority: Key },
    /// [config_owner(s), amm_config, pool(w)]
    SetPoolStatus { status: u8 },
    /// [config_owner(s), amm_config, authority, pool(w), token_program, token_2022_program,
    ///  then n x (mint, recipient(w), vault(w))]  kind: 0 protocol, 1 fund
    CollectFees { kind: u8 },
}
