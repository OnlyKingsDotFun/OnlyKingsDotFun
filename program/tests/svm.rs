#![cfg(feature = "svm-tests")]
use collection_amm::{instruction::AmmInstruction as I, state::*, tokens};
use mollusk_svm::Mollusk;
use solana_account::Account;
use solana_instruction::{AccountMeta, Instruction};
use solana_pubkey::Pubkey;
use spl_token_2022_interface::state::{Account as TokenAccount, AccountState, Mint};
use solana_program_pack::Pack;
use std::{collections::BTreeMap, path::PathBuf};

const ID: Pubkey = Pubkey::new_from_array([7; 32]);
const TP: Pubkey = Pubkey::new_from_array(pinocchio_token::ID.to_bytes());
const TP22: Pubkey = Pubkey::new_from_array(tokens::ID22.to_bytes());
const SYS: Pubkey = Pubkey::new_from_array(pinocchio_system::ID.to_bytes());

fn w(p: Pubkey) -> AccountMeta { AccountMeta::new(p, false) }
fn r(p: Pubkey) -> AccountMeta { AccountMeta::new_readonly(p, false) }
fn s(p: Pubkey) -> AccountMeta { AccountMeta::new(p, true) }
fn pd(seeds: &[&[u8]]) -> Pubkey { Pubkey::find_program_address(seeds, &ID).0 }
fn base(owner: Pubkey, data: Vec<u8>) -> Account {
    Account { lamports: 100_000_000, data, owner, executable: false, rent_epoch: 0 }
}
fn mint(decimals: u8) -> Account {
    let mut data = vec![0; Mint::LEN];
    Mint { decimals, is_initialized: true, supply: 1 << 40, ..Default::default() }.pack_into_slice(&mut data);
    base(TP, data)
}
fn token(mint: Pubkey, owner: Pubkey, amount: u64) -> Account {
    let mut data = vec![0; TokenAccount::LEN];
    TokenAccount { mint, owner, amount, state: AccountState::Initialized, ..Default::default() }.pack_into_slice(&mut data);
    base(TP, data)
}
fn amount_of(a: &Account) -> u64 { u64::from_le_bytes(a.data[64..72].try_into().unwrap()) }

struct Bank { vm: Mollusk, accounts: BTreeMap<Pubkey, Account> }
impl Bank {
    fn new() -> Self {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_path_buf();
        let mut vm = Mollusk::new(&ID, root.join("target/deploy/collection_amm").to_str().unwrap());
        vm.sysvars.clock.unix_timestamp = 1_000_000;
        mollusk_svm_programs_token::token::add_program(&mut vm);
        mollusk_svm_programs_token::token2022::add_program(&mut vm);
        let mut accounts = BTreeMap::new();
        for k in [TP, TP22] {
            accounts.insert(k, Account { lamports: 1, owner: solana_sdk_ids::bpf_loader::ID, executable: true, ..Default::default() });
        }
        accounts.insert(SYS, Account { lamports: 1, owner: solana_sdk_ids::native_loader::ID, executable: true, ..Default::default() });
        let (rk, ra) = vm.sysvars.keyed_account_for_rent_sysvar();
        accounts.insert(rk, ra);
        Self { vm, accounts }
    }
    fn run(&mut self, ix: I, metas: Vec<AccountMeta>) -> Result<u64, String> {
        let mut keys: Vec<_> = metas.iter().map(|m| m.pubkey).collect();
        keys.sort();
        keys.dedup();
        let accounts: Vec<_> = keys.into_iter().map(|k| (k, self.accounts.get(&k).cloned().unwrap_or_default())).collect();
        let res = self.vm.process_instruction(&Instruction { program_id: ID, accounts: metas, data: borsh::to_vec(&ix).unwrap() }, &accounts);
        match res.program_result {
            mollusk_svm::result::ProgramResult::Success => {
                for (k, a) in res.resulting_accounts { self.accounts.insert(k, a); }
                Ok(res.compute_units_consumed)
            }
            e => Err(format!("{ix:?}: {e:?}")),
        }
    }
    fn ok(&mut self, ix: I, metas: Vec<AccountMeta>) -> u64 { self.run(ix, metas).unwrap() }
    fn fails(&mut self, ix: I, metas: Vec<AccountMeta>, code: u32) {
        let e = self.run(ix, metas).unwrap_err();
        assert!(e.contains(&format!("Custom({code})")), "expected custom {code}, got {e}");
    }
    fn pool(&self, k: Pubkey) -> PoolState { borsh::BorshDeserialize::try_from_slice(&self.accounts[&k].data[8..]).unwrap() }
    fn bal(&self, k: Pubkey) -> u64 { amount_of(&self.accounts[&k]) }
}

struct Fixture { bank: Bank, admin: Pubkey, user: Pubkey, cfg: Pubkey, auth: Pubkey, pool: Pubkey, lp_mint: Pubkey, user_lp: Pubkey, mints: Vec<Pubkey>, vaults: Vec<Pubkey>, user_tokens: Vec<Pubkey>, decimals: Vec<u8> }
impl Fixture {
    fn new(curve: u8, amp: u64, decimals: &[u8], rates: &[u64]) -> Self {
        let mut bank = Bank::new();
        let admin = Pubkey::new_unique();
        let user = Pubkey::new_unique();
        for k in [admin, user] { bank.accounts.insert(k, Account { lamports: 10_000_000_000, owner: SYS, ..Default::default() }); }
        let cfg = pd(&[CONFIG_SEED, admin.as_ref(), &0u16.to_le_bytes()]);
        bank.ok(I::CreateAmmConfig { index: 0, trade_fee_rate: 2_500, protocol_fee_rate: 120_000, fund_fee_rate: 40_000, rebalance_fee_divisor: 100 }, vec![s(admin), w(cfg), r(SYS)]);
        let auth = pd(&[AUTH_SEED]);
        let pool = pd(&[POOL_SEED, cfg.as_ref(), admin.as_ref(), &1u64.to_le_bytes()]);
        let lp_mint = pd(&[LP_MINT_SEED, pool.as_ref()]);
        let n = decimals.len();
        let mints: Vec<Pubkey> = (0..n).map(|_| Pubkey::new_unique()).collect();
        let vaults: Vec<Pubkey> = mints.iter().map(|m| pd(&[VAULT_SEED, pool.as_ref(), m.as_ref()])).collect();
        let user_tokens: Vec<Pubkey> = (0..n).map(|_| Pubkey::new_unique()).collect();
        for i in 0..n {
            bank.accounts.insert(mints[i], mint(decimals[i]));
            bank.accounts.insert(user_tokens[i], token(mints[i], user, 10u64.pow(decimals[i] as u32) * 10_000_000));
        }
        let mut rs = [0u64; MAX_TOKENS];
        rs[..n].copy_from_slice(rates);
        let mut metas = vec![s(admin), r(cfg), r(auth), w(pool), w(lp_mint), r(TP), r(SYS), r(TP), r(TP22)];
        for i in 0..n { metas.push(r(mints[i])); metas.push(w(vaults[i])); }
        let cu = bank.ok(I::InitializePool { nonce: 1, curve, amp, open_time: 0, n: n as u8, rates: rs }, metas);
        eprintln!("init pool n={n}: {cu} CU");
        let user_lp = Pubkey::new_unique();
        bank.accounts.insert(user_lp, token(lp_mint, user, 0));
        Self { bank, admin, user, cfg, auth, pool, lp_mint, user_lp, mints, vaults, user_tokens, decimals: decimals.to_vec() }
    }
    fn liq_metas(&self) -> Vec<AccountMeta> {
        let mut m = vec![s(self.user), r(self.auth), w(self.pool), w(self.lp_mint), w(self.user_lp), r(TP), r(TP), r(TP22)];
        for i in 0..self.mints.len() { m.push(r(self.mints[i])); m.push(w(self.user_tokens[i])); m.push(w(self.vaults[i])); }
        m
    }
    fn swap_metas(&self, i: usize, j: usize) -> Vec<AccountMeta> {
        vec![s(self.user), r(self.auth), r(self.cfg), w(self.pool), r(TP), r(TP22), r(self.mints[i]), w(self.user_tokens[i]), w(self.vaults[i]), r(self.mints[j]), w(self.user_tokens[j]), w(self.vaults[j])]
    }
    fn arr(&self, v: &[u64]) -> [u64; MAX_TOKENS] { let mut a = [0; MAX_TOKENS]; a[..v.len()].copy_from_slice(v); a }
    fn units(&self, i: usize, whole: u64) -> u64 { whole * 10u64.pow(self.decimals[i] as u32) }
}

#[test]
fn stable_pool_lifecycle() {
    // USDC(6) / USDT(6) / DAI-like(9) stable collection, A=200.
    let mut f = Fixture::new(Curve::Stable as u8, 200, &[6, 6, 9], &[RATE_ONE, RATE_ONE, RATE_ONE]);
    let amts = [f.units(0, 1_000_000), f.units(1, 1_000_000), f.units(2, 1_000_000)];
    let cu = f.bank.ok(I::Deposit { lp_amount: 0, max_amounts: f.arr(&amts) }, f.liq_metas());
    eprintln!("first deposit: {cu} CU");
    let p = f.bank.pool(f.pool);
    assert_eq!(p.lp_supply, 3_000_000 * 1_000_000_000);
    assert_eq!(f.bank.bal(f.user_lp), p.lp_supply - LOCKED_LP);
    assert_eq!(p.reserves[..3], amts);

    // Proportional second deposit.
    let lp2 = 300_000 * 1_000_000_000;
    let max = [f.units(0, 100_000), f.units(1, 100_000), f.units(2, 100_000)];
    f.bank.ok(I::Deposit { lp_amount: lp2, max_amounts: f.arr(&max) }, f.liq_metas());
    assert_eq!(f.bank.pool(f.pool).reserves[0], f.units(0, 1_100_000));
    f.bank.fails(I::Deposit { lp_amount: lp2, max_amounts: f.arr(&[1, 1, 1]) }, f.liq_metas(), 6010);

    // Standard swap USDC -> DAI: near peg, 0.25% fee.
    let before_out = f.bank.bal(f.user_tokens[2]);
    let cu = f.bank.ok(I::Swap { in_index: 0, out_index: 2, amount_in: f.units(0, 10_000), min_amount_out: f.units(2, 9_950) }, f.swap_metas(0, 2));
    eprintln!("stable swap: {cu} CU");
    let got = f.bank.bal(f.user_tokens[2]) - before_out;
    assert!(got > f.units(2, 9_970) && got < f.units(2, 9_976), "got {got}");
    let p = f.bank.pool(f.pool);
    let fee = 25 * 10u64.pow(6); // 0.25% of 10_000 USDC
    assert_eq!(p.protocol_fees_owed[0], fee * 12 / 100);
    assert_eq!(p.fund_fees_owed[0], fee * 4 / 100);

    // Pool now heavy in USDC, light in DAI. Rebalance in the same direction must fail...
    f.bank.fails(I::RebalanceSwap { in_index: 0, out_index: 2, amount_in: f.units(0, 100), min_amount_out: 0 }, f.swap_metas(0, 2), 6016);
    // ...but DAI -> USDC reduces imbalance and pays fee/100 (0.0025%).
    let before_out = f.bank.bal(f.user_tokens[0]);
    let cu = f.bank.ok(I::RebalanceSwap { in_index: 2, out_index: 0, amount_in: f.units(2, 5_000), min_amount_out: 0 }, f.swap_metas(2, 0));
    eprintln!("rebalance swap: {cu} CU");
    let got = f.bank.bal(f.user_tokens[0]) - before_out;
    assert!(got > f.units(0, 4_999) && got <= f.units(0, 5_001), "rebalance got {got}");
    let p2 = f.bank.pool(f.pool);
    // protocol fee on 5_000 DAI at 0.0025% = 0.125 DAI -> 12% = 0.015 DAI
    assert_eq!(p2.protocol_fees_owed[2], 15_000_000);
    // Overshooting rebalance is rejected.
    f.bank.fails(I::RebalanceSwap { in_index: 2, out_index: 0, amount_in: f.units(2, 100_000), min_amount_out: 0 }, f.swap_metas(2, 0), 6016);

    // Collect protocol fees.
    let recip: Vec<Pubkey> = (0..3).map(|_| Pubkey::new_unique()).collect();
    for i in 0..3 { f.bank.accounts.insert(recip[i], token(f.mints[i], f.admin, 0)); }
    let mut m = vec![s(f.admin), r(f.cfg), r(f.auth), w(f.pool), r(TP), r(TP22)];
    for i in 0..3 { m.push(r(f.mints[i])); m.push(w(recip[i])); m.push(w(f.vaults[i])); }
    f.bank.ok(I::CollectFees { kind: 0 }, m.clone());
    assert_eq!(f.bank.bal(recip[0]), fee * 12 / 100);
    assert_eq!(f.bank.pool(f.pool).protocol_fees_owed[0], 0);
    let user_meta = m[0].clone();
    m[0] = s(f.user);
    let _ = user_meta;
    f.bank.fails(I::CollectFees { kind: 1 }, m, 6000);

    // Withdraw everything the user holds; vault must retain fund fees + locked share.
    let lp = f.bank.bal(f.user_lp);
    f.bank.ok(I::Withdraw { lp_amount: lp, min_amounts: f.arr(&[0, 0, 0]) }, f.liq_metas());
    let p3 = f.bank.pool(f.pool);
    assert_eq!(p3.lp_supply, LOCKED_LP);
    for i in 0..3 { assert!(f.bank.bal(f.vaults[i]) >= p3.reserves[i] + p3.fund_fees_owed[i]); }
    // Swaps are unusable on an almost-empty pool but state is consistent.
    f.bank.ok(I::SetPoolStatus { status: STATUS_SWAP_OFF }, vec![s(f.admin), r(f.cfg), w(f.pool)]);
    f.bank.fails(I::Swap { in_index: 0, out_index: 1, amount_in: 10, min_amount_out: 0 }, f.swap_metas(0, 1), 6011);
}

#[test]
fn constant_product_with_rates() {
    // SOL(9) / LST(9, rate 1.15 SOL) / USDC(6, rate 1/150 SOL) collection, geometric-mean curve. Numeraire: SOL.
    let mut f = Fixture::new(Curve::ConstantProduct as u8, 0, &[9, 9, 6], &[RATE_ONE, 1_150_000_000, RATE_ONE / 150]);
    // Equal value per leg: 1150 SOL, 1000 LST, 172_500 USDC.
    let amts = [f.units(0, 1_150), f.units(1, 1_000), f.units(2, 172_500)];
    f.bank.ok(I::Deposit { lp_amount: 0, max_amounts: f.arr(&amts) }, f.liq_metas());
    // Pairwise CPMM: 115 SOL (10% of 1150) -> LST out = 1000 * 115/(1150+115) ≈ 90.9 LST (before fee)
    let before = f.bank.bal(f.user_tokens[1]);
    f.bank.ok(I::Swap { in_index: 0, out_index: 1, amount_in: f.units(0, 115), min_amount_out: 0 }, f.swap_metas(0, 1));
    let got = f.bank.bal(f.user_tokens[1]) - before;
    assert!(got > 90_600_000_000 && got < 90_910_000_000, "{got}");
    // Rebalance back toward equal value: LST -> SOL discounted; SOL -> LST rejected.
    f.bank.fails(I::RebalanceSwap { in_index: 0, out_index: 1, amount_in: f.units(0, 1), min_amount_out: 0 }, f.swap_metas(0, 1), 6016);
    f.bank.ok(I::RebalanceSwap { in_index: 1, out_index: 0, amount_in: f.units(1, 40), min_amount_out: 0 }, f.swap_metas(1, 0));
    // Rate authority (creator) can re-mark the LST.
    let mut rates = f.bank.pool(f.pool).rates;
    rates[1] = 1_200_000_000;
    f.bank.fails(I::UpdateRates { rates }, vec![s(f.user), w(f.pool)], 6000);
    f.bank.ok(I::UpdateRates { rates }, vec![s(f.admin), w(f.pool)]);
    assert_eq!(f.bank.pool(f.pool).rates[1], 1_200_000_000);
}

#[test]
fn eight_asset_pool_fits() {
    let dec = [6u8; 8];
    let rates = [RATE_ONE; 8];
    let mut f = Fixture::new(Curve::Stable as u8, 500, &dec, &rates);
    let amts: Vec<u64> = (0..8).map(|i| f.units(i, 1_000_000)).collect();
    let cu = f.bank.ok(I::Deposit { lp_amount: 0, max_amounts: f.arr(&amts) }, f.liq_metas());
    eprintln!("8-asset first deposit: {cu} CU, {} accounts", f.liq_metas().len());
    let cu = f.bank.ok(I::Swap { in_index: 3, out_index: 7, amount_in: f.units(3, 50_000), min_amount_out: f.units(7, 49_800) }, f.swap_metas(3, 7));
    eprintln!("8-asset stable swap: {cu} CU");
    assert!(cu < 200_000);
}
