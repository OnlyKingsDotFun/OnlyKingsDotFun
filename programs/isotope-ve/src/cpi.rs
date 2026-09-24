//! Raw cp-swap CPIs (account orders from the IDL) and the cp-swap layouts we read.
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::{AccountMeta, Instruction}, program::invoke_signed};

/// cp-swap `TokenCollection` (disc 8 | bump 1 | index 2 | pad 5 | authority | ruleset | quote_mint ...)
pub const COLLECTION_DISC: [u8; 8] = [199, 20, 36, 91, 142, 152, 218, 78];
pub const COLLECTION_QUOTE_MINT: usize = 80;
/// cp-swap `PoolState`
pub const POOL_AMM_CONFIG: usize = 8;
pub const POOL_CREATOR: usize = 40;
pub const POOL_VAULT_0: usize = 72;
pub const POOL_VAULT_1: usize = 104;
pub const POOL_LP_MINT: usize = 136;
pub const POOL_MINT_0: usize = 168;
pub const POOL_MINT_1: usize = 200;
pub const POOL_TP_0: usize = 232;
pub const POOL_TP_1: usize = 264;
pub const POOL_OBSERVATION: usize = 296;
pub const POOL_LP_SUPPLY: usize = 333;
pub const POOL_PROTOCOL_FEES_0: usize = 341;
pub const POOL_PROTOCOL_FEES_1: usize = 349;
pub const POOL_FUND_FEES_0: usize = 357;
pub const POOL_FUND_FEES_1: usize = 365;
pub const POOL_CREATOR_FEES_0: usize = 397;
pub const POOL_CREATOR_FEES_1: usize = 405;
/// cp-swap `AmmConfig`: disc 8 | bump 1 | disable_create_pool 1 | index 2 | trade_fee_rate u64
pub const AMM_CONFIG_TRADE_FEE_RATE: usize = 12;
pub const FEE_RATE_DENOMINATOR: u128 = 1_000_000;

pub fn pk(d: &[u8], o: usize) -> Pubkey { Pubkey::new_from_array(d[o..o + 32].try_into().unwrap()) }
pub fn u64_at(d: &[u8], o: usize) -> u64 { u64::from_le_bytes(d[o..o + 8].try_into().unwrap()) }
fn w(k: Pubkey) -> AccountMeta { AccountMeta::new(k, false) }
fn r(k: Pubkey) -> AccountMeta { AccountMeta::new_readonly(k, false) }
fn ws(k: Pubkey) -> AccountMeta { AccountMeta::new(k, true) }
fn rs(k: Pubkey) -> AccountMeta { AccountMeta::new_readonly(k, true) }

pub struct CpmmSwap<'a, 'info> {
    pub program: &'a AccountInfo<'info>,
    pub payer: &'a AccountInfo<'info>,
    pub authority: &'a AccountInfo<'info>,
    pub amm_config: &'a AccountInfo<'info>,
    pub pool_state: &'a AccountInfo<'info>,
    pub input_token_account: &'a AccountInfo<'info>,
    pub output_token_account: &'a AccountInfo<'info>,
    pub input_vault: &'a AccountInfo<'info>,
    pub output_vault: &'a AccountInfo<'info>,
    pub input_token_program: &'a AccountInfo<'info>,
    pub output_token_program: &'a AccountInfo<'info>,
    pub input_token_mint: &'a AccountInfo<'info>,
    pub output_token_mint: &'a AccountInfo<'info>,
    pub observation_state: &'a AccountInfo<'info>,
}
/// cp-swap `swap_base_input(amount_in, minimum_amount_out)`
pub fn cpmm_swap_base_input<'info>(s: &CpmmSwap<'_, 'info>, amount_in: u64, min_out: u64, seeds: &[&[u8]]) -> Result<()> {
    let mut data = vec![143, 190, 90, 218, 196, 30, 51, 222];
    data.extend(amount_in.to_le_bytes());
    data.extend(min_out.to_le_bytes());
    let ix = Instruction {
        program_id: s.program.key(),
        accounts: vec![rs(s.payer.key()), r(s.authority.key()), r(s.amm_config.key()), w(s.pool_state.key()), w(s.input_token_account.key()), w(s.output_token_account.key()), w(s.input_vault.key()), w(s.output_vault.key()), r(s.input_token_program.key()), r(s.output_token_program.key()), r(s.input_token_mint.key()), r(s.output_token_mint.key()), w(s.observation_state.key())],
        data,
    };
    invoke_signed(&ix, &[s.payer.clone(), s.authority.clone(), s.amm_config.clone(), s.pool_state.clone(), s.input_token_account.clone(), s.output_token_account.clone(), s.input_vault.clone(), s.output_vault.clone(), s.input_token_program.clone(), s.output_token_program.clone(), s.input_token_mint.clone(), s.output_token_mint.clone(), s.observation_state.clone()], &[seeds]).map_err(Into::into)
}

pub struct CpmmDeposit<'a, 'info> {
    pub program: &'a AccountInfo<'info>,
    pub owner: &'a AccountInfo<'info>,
    pub authority: &'a AccountInfo<'info>,
    pub pool_state: &'a AccountInfo<'info>,
    pub owner_lp_token: &'a AccountInfo<'info>,
    pub token_0_account: &'a AccountInfo<'info>,
    pub token_1_account: &'a AccountInfo<'info>,
    pub token_0_vault: &'a AccountInfo<'info>,
    pub token_1_vault: &'a AccountInfo<'info>,
    pub token_program: &'a AccountInfo<'info>,
    pub token_program_2022: &'a AccountInfo<'info>,
    pub vault_0_mint: &'a AccountInfo<'info>,
    pub vault_1_mint: &'a AccountInfo<'info>,
    pub lp_mint: &'a AccountInfo<'info>,
}
/// cp-swap `deposit(lp_token_amount, maximum_token_0_amount, maximum_token_1_amount)`
pub fn cpmm_deposit<'info>(d: &CpmmDeposit<'_, 'info>, lp_amount: u64, max_0: u64, max_1: u64, seeds: &[&[u8]]) -> Result<()> {
    let mut data = vec![242, 35, 198, 137, 82, 225, 242, 182];
    data.extend(lp_amount.to_le_bytes());
    data.extend(max_0.to_le_bytes());
    data.extend(max_1.to_le_bytes());
    let ix = Instruction {
        program_id: d.program.key(),
        accounts: vec![rs(d.owner.key()), r(d.authority.key()), w(d.pool_state.key()), w(d.owner_lp_token.key()), w(d.token_0_account.key()), w(d.token_1_account.key()), w(d.token_0_vault.key()), w(d.token_1_vault.key()), r(d.token_program.key()), r(d.token_program_2022.key()), r(d.vault_0_mint.key()), r(d.vault_1_mint.key()), w(d.lp_mint.key())],
        data,
    };
    invoke_signed(&ix, &[d.owner.clone(), d.authority.clone(), d.pool_state.clone(), d.owner_lp_token.clone(), d.token_0_account.clone(), d.token_1_account.clone(), d.token_0_vault.clone(), d.token_1_vault.clone(), d.token_program.clone(), d.token_program_2022.clone(), d.vault_0_mint.clone(), d.vault_1_mint.clone(), d.lp_mint.clone()], &[seeds]).map_err(Into::into)
}

pub struct CpmmCollectCreatorFee<'a, 'info> {
    pub program: &'a AccountInfo<'info>,
    pub creator: &'a AccountInfo<'info>,
    pub authority: &'a AccountInfo<'info>,
    pub pool_state: &'a AccountInfo<'info>,
    pub amm_config: &'a AccountInfo<'info>,
    pub token_0_vault: &'a AccountInfo<'info>,
    pub token_1_vault: &'a AccountInfo<'info>,
    pub vault_0_mint: &'a AccountInfo<'info>,
    pub vault_1_mint: &'a AccountInfo<'info>,
    pub creator_token_0: &'a AccountInfo<'info>,
    pub creator_token_1: &'a AccountInfo<'info>,
    pub token_0_program: &'a AccountInfo<'info>,
    pub token_1_program: &'a AccountInfo<'info>,
    pub associated_token_program: &'a AccountInfo<'info>,
    pub system_program: &'a AccountInfo<'info>,
}
/// cp-swap `collect_creator_fee`, creator = our treasury PDA
pub fn cpmm_collect_creator_fee<'info>(c: &CpmmCollectCreatorFee<'_, 'info>, seeds: &[&[u8]]) -> Result<()> {
    let ix = Instruction {
        program_id: c.program.key(),
        accounts: vec![ws(c.creator.key()), r(c.authority.key()), w(c.pool_state.key()), r(c.amm_config.key()), w(c.token_0_vault.key()), w(c.token_1_vault.key()), r(c.vault_0_mint.key()), r(c.vault_1_mint.key()), w(c.creator_token_0.key()), w(c.creator_token_1.key()), r(c.token_0_program.key()), r(c.token_1_program.key()), r(c.associated_token_program.key()), r(c.system_program.key())],
        data: vec![20, 22, 86, 123, 198, 28, 219, 132],
    };
    invoke_signed(&ix, &[c.creator.clone(), c.authority.clone(), c.pool_state.clone(), c.amm_config.clone(), c.token_0_vault.clone(), c.token_1_vault.clone(), c.vault_0_mint.clone(), c.vault_1_mint.clone(), c.creator_token_0.clone(), c.creator_token_1.clone(), c.token_0_program.clone(), c.token_1_program.clone(), c.associated_token_program.clone(), c.system_program.clone()], &[seeds]).map_err(Into::into)
}
