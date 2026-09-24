//! Raw CPI helpers. Account orders come from the programs' IDLs; the launch program signs as `partner`.
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::{AccountMeta, Instruction}, program::invoke_signed};

pub const DBC_PROGRAM: Pubkey = pubkey!("dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN");
pub const DAMM_V2_PROGRAM: Pubkey = pubkey!("cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG");
pub const DAMM_V2_POOL_AUTHORITY: Pubkey = pubkey!("HLnpSz9h2S4hiLQ43rnSD9XkcUThA7B8hQMKmDaiTLcC");

// ---- DBC account layouts (from the DBC IDL; PoolState embedded at 8 in VirtualPool) ----
pub const DBC_VIRTUAL_POOL_DISC: [u8; 8] = [213, 224, 5, 209, 98, 69, 119, 92];
pub const DBC_POOL_CONFIG_DISC: [u8; 8] = [26, 108, 14, 123, 116, 230, 129, 43];
pub const VP_CONFIG: usize = 72;
pub const VP_BASE_MINT: usize = 136;
pub const VP_IS_MIGRATED: usize = 305;
pub const CFG_QUOTE_MINT: usize = 8;
pub const CFG_FEE_CLAIMER: usize = 40;
pub const CFG_LEFTOVER_RECEIVER: usize = 72;
// ---- DAMM v2 ----
pub const DAMM_POOL_DISC: [u8; 8] = [241, 154, 109, 4, 17, 177, 109, 188];
pub const POSITION_POOL: usize = 8;
pub const POSITION_NFT_MINT: usize = 40;
pub const POSITION_UNLOCKED_LIQ: usize = 152;
pub const POSITION_VESTED_LIQ: usize = 168;
pub const POSITION_PERM_LOCKED_LIQ: usize = 184;
// Pool: disc | pool_fees (...) | token_a_mint | token_b_mint | token_a_vault | token_b_vault ... offsets resolved at runtime via the IDL-derived constants below
pub const DAMM_POOL_TOKEN_A_MINT: usize = 168;
pub const DAMM_POOL_TOKEN_B_MINT: usize = 200;
pub const DAMM_POOL_TOKEN_A_VAULT: usize = 232;
pub const DAMM_POOL_TOKEN_B_VAULT: usize = 264;

pub fn pk(d: &[u8], o: usize) -> Pubkey {
    Pubkey::new_from_array(d[o..o + 32].try_into().unwrap())
}
fn w(k: Pubkey) -> AccountMeta { AccountMeta::new(k, false) }
fn r(k: Pubkey) -> AccountMeta { AccountMeta::new_readonly(k, false) }
fn ws(k: Pubkey) -> AccountMeta { AccountMeta::new(k, true) }
fn rs(k: Pubkey) -> AccountMeta { AccountMeta::new_readonly(k, true) }

pub struct DammPosition<'a, 'info> {
    pub pool: &'a AccountInfo<'info>,
    pub position: &'a AccountInfo<'info>,
    pub position_nft_account: &'a AccountInfo<'info>,
    pub position_nft_mint: &'a AccountInfo<'info>,
    pub token_a_account: &'a AccountInfo<'info>,
    pub token_b_account: &'a AccountInfo<'info>,
    pub token_a_vault: &'a AccountInfo<'info>,
    pub token_b_vault: &'a AccountInfo<'info>,
    pub token_a_mint: &'a AccountInfo<'info>,
    pub token_b_mint: &'a AccountInfo<'info>,
    pub token_a_program: &'a AccountInfo<'info>,
    pub token_b_program: &'a AccountInfo<'info>,
    pub event_authority: &'a AccountInfo<'info>,
    pub program: &'a AccountInfo<'info>,
    pub pool_authority: &'a AccountInfo<'info>,
}

fn damm_position_metas(p: &DammPosition, signer: Pubkey) -> Vec<AccountMeta> {
    vec![
        r(p.pool_authority.key()), w(p.pool.key()), w(p.position.key()), w(p.token_a_account.key()), w(p.token_b_account.key()),
        w(p.token_a_vault.key()), w(p.token_b_vault.key()), r(p.token_a_mint.key()), r(p.token_b_mint.key()), r(p.position_nft_account.key()),
        rs(signer), r(p.token_a_program.key()), r(p.token_b_program.key()), r(p.event_authority.key()), r(p.program.key()),
    ]
}
fn damm_position_infos<'info>(p: &DammPosition<'_, 'info>, signer: &AccountInfo<'info>) -> Vec<AccountInfo<'info>> {
    vec![
        p.pool_authority.clone(), p.pool.clone(), p.position.clone(), p.token_a_account.clone(), p.token_b_account.clone(),
        p.token_a_vault.clone(), p.token_b_vault.clone(), p.token_a_mint.clone(), p.token_b_mint.clone(), p.position_nft_account.clone(),
        signer.clone(), p.token_a_program.clone(), p.token_b_program.clone(), p.event_authority.clone(), p.program.clone(),
    ]
}

/// DAMM v2 `claim_position_fee`
pub fn damm_claim_position_fee<'info>(p: &DammPosition<'_, 'info>, signer: &AccountInfo<'info>, seeds: &[&[u8]]) -> Result<()> {
    let ix = Instruction { program_id: p.program.key(), accounts: damm_position_metas(p, signer.key()), data: vec![180, 38, 154, 17, 133, 33, 162, 211] };
    invoke_signed(&ix, &damm_position_infos(p, signer), &[seeds]).map_err(Into::into)
}
/// DAMM v2 `remove_all_liquidity(token_a_amount_threshold, token_b_amount_threshold)`
pub fn damm_remove_all_liquidity<'info>(p: &DammPosition<'_, 'info>, signer: &AccountInfo<'info>, seeds: &[&[u8]]) -> Result<()> {
    let mut data = vec![10, 51, 61, 35, 112, 105, 24, 85];
    data.extend(0u64.to_le_bytes());
    data.extend(0u64.to_le_bytes());
    let ix = Instruction { program_id: p.program.key(), accounts: damm_position_metas(p, signer.key()), data };
    invoke_signed(&ix, &damm_position_infos(p, signer), &[seeds]).map_err(Into::into)
}
/// DAMM v2 `close_position`
pub fn damm_close_position<'info>(p: &DammPosition<'_, 'info>, owner: &AccountInfo<'info>, rent_receiver: &AccountInfo<'info>, token_2022: &AccountInfo<'info>, seeds: &[&[u8]]) -> Result<()> {
    let ix = Instruction {
        program_id: p.program.key(),
        accounts: vec![w(p.position_nft_mint.key()), w(p.position_nft_account.key()), w(p.pool.key()), w(p.position.key()), r(p.pool_authority.key()), w(rent_receiver.key()), rs(owner.key()), r(token_2022.key()), r(p.event_authority.key()), r(p.program.key())],
        data: vec![123, 134, 81, 0, 49, 68, 98, 98],
    };
    invoke_signed(&ix, &[p.position_nft_mint.clone(), p.position_nft_account.clone(), p.pool.clone(), p.position.clone(), p.pool_authority.clone(), rent_receiver.clone(), owner.clone(), token_2022.clone(), p.event_authority.clone(), p.program.clone()], &[seeds]).map_err(Into::into)
}

// ---- cp-swap fork ----
pub struct CpmmInit<'a, 'info> {
    pub program: &'a AccountInfo<'info>,
    pub creator: &'a AccountInfo<'info>,
    pub amm_config: &'a AccountInfo<'info>,
    pub authority: &'a AccountInfo<'info>,
    pub pool_state: &'a AccountInfo<'info>,
    pub token_0_mint: &'a AccountInfo<'info>,
    pub token_1_mint: &'a AccountInfo<'info>,
    pub lp_mint: &'a AccountInfo<'info>,
    pub creator_token_0: &'a AccountInfo<'info>,
    pub creator_token_1: &'a AccountInfo<'info>,
    pub creator_lp_token: &'a AccountInfo<'info>,
    pub token_0_vault: &'a AccountInfo<'info>,
    pub token_1_vault: &'a AccountInfo<'info>,
    pub create_pool_fee: &'a AccountInfo<'info>,
    pub observation_state: &'a AccountInfo<'info>,
    pub token_program: &'a AccountInfo<'info>,
    pub token_0_program: &'a AccountInfo<'info>,
    pub token_1_program: &'a AccountInfo<'info>,
    pub associated_token_program: &'a AccountInfo<'info>,
    pub system_program: &'a AccountInfo<'info>,
    pub rent: &'a AccountInfo<'info>,
}
/// cp-swap `initialize(init_amount_0, init_amount_1, open_time)`, signed by the partner as creator.
pub fn cpmm_initialize<'info>(c: &CpmmInit<'_, 'info>, amount_0: u64, amount_1: u64, seeds: &[&[u8]]) -> Result<()> {
    let mut data = vec![175, 175, 109, 31, 13, 152, 155, 237];
    data.extend(amount_0.to_le_bytes());
    data.extend(amount_1.to_le_bytes());
    data.extend(0u64.to_le_bytes());
    let ix = Instruction {
        program_id: c.program.key(),
        accounts: vec![
            ws(c.creator.key()), r(c.amm_config.key()), r(c.authority.key()), w(c.pool_state.key()), r(c.token_0_mint.key()), r(c.token_1_mint.key()), w(c.lp_mint.key()),
            w(c.creator_token_0.key()), w(c.creator_token_1.key()), w(c.creator_lp_token.key()), w(c.token_0_vault.key()), w(c.token_1_vault.key()), w(c.create_pool_fee.key()), w(c.observation_state.key()),
            r(c.token_program.key()), r(c.token_0_program.key()), r(c.token_1_program.key()), r(c.associated_token_program.key()), r(c.system_program.key()), r(c.rent.key()),
        ],
        data,
    };
    invoke_signed(&ix, &[
        c.creator.clone(), c.amm_config.clone(), c.authority.clone(), c.pool_state.clone(), c.token_0_mint.clone(), c.token_1_mint.clone(), c.lp_mint.clone(),
        c.creator_token_0.clone(), c.creator_token_1.clone(), c.creator_lp_token.clone(), c.token_0_vault.clone(), c.token_1_vault.clone(), c.create_pool_fee.clone(), c.observation_state.clone(),
        c.token_program.clone(), c.token_0_program.clone(), c.token_1_program.clone(), c.associated_token_program.clone(), c.system_program.clone(), c.rent.clone(),
    ], &[seeds]).map_err(Into::into)
}

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

/// cp-swap `register_collection_member` with the DBC proof `[virtual_pool, pool_config]`
pub fn cpmm_register_member<'info>(program: &AccountInfo<'info>, payer: &AccountInfo<'info>, collection: &AccountInfo<'info>, ruleset: &AccountInfo<'info>, mint: &AccountInfo<'info>, member: &AccountInfo<'info>, system_program: &AccountInfo<'info>, proof: &[AccountInfo<'info>], seeds: &[&[u8]]) -> Result<()> {
    let mut accounts = vec![ws(payer.key()), w(collection.key()), r(ruleset.key()), r(mint.key()), w(member.key()), r(system_program.key())];
    accounts.extend(proof.iter().map(|p| r(p.key())));
    let mut infos = vec![payer.clone(), collection.clone(), ruleset.clone(), mint.clone(), member.clone(), system_program.clone()];
    infos.extend(proof.iter().cloned());
    let ix = Instruction { program_id: program.key(), accounts, data: vec![189, 156, 113, 17, 73, 63, 122, 111] };
    invoke_signed(&ix, &infos, &[seeds]).map_err(Into::into)
}
/// cp-swap `add_pool_member`
pub fn cpmm_add_pool_member<'info>(program: &AccountInfo<'info>, payer: &AccountInfo<'info>, authority: &AccountInfo<'info>, pool_state: &AccountInfo<'info>, pool_members: &AccountInfo<'info>, collection_member: &AccountInfo<'info>, mint: &AccountInfo<'info>, member_vault: &AccountInfo<'info>, token_program: &AccountInfo<'info>, system_program: &AccountInfo<'info>, rent: &AccountInfo<'info>, seeds: &[&[u8]]) -> Result<()> {
    let ix = Instruction {
        program_id: program.key(),
        accounts: vec![ws(payer.key()), r(authority.key()), r(pool_state.key()), w(pool_members.key()), r(collection_member.key()), r(mint.key()), w(member_vault.key()), r(token_program.key()), r(system_program.key()), r(rent.key())],
        data: vec![146, 14, 31, 156, 101, 69, 133, 52],
    };
    invoke_signed(&ix, &[payer.clone(), authority.clone(), pool_state.clone(), pool_members.clone(), collection_member.clone(), mint.clone(), member_vault.clone(), token_program.clone(), system_program.clone(), rent.clone()], &[seeds]).map_err(Into::into)
}
