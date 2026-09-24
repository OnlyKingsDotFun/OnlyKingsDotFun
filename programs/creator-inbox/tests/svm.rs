#![cfg(feature = "svm-tests")]
use creator_inbox::{state::*, Error, Instruction as I};
use mollusk_svm::{result::ProgramResult, Mollusk};
use solana_account::Account;
use solana_instruction::{AccountMeta, Instruction};
use solana_pubkey::Pubkey;
use std::{collections::BTreeMap, path::PathBuf};

const ID: Pubkey = Pubkey::new_from_array([17; 32]);
const SYS: Pubkey = Pubkey::new_from_array(pinocchio_system::ID.to_bytes());
const TP: Pubkey = Pubkey::new_from_array(pinocchio_token::ID.to_bytes());
fn pk(a: pinocchio::Address) -> Pubkey {
    Pubkey::new_from_array(a.to_bytes())
}
fn w(p: Pubkey) -> AccountMeta {
    AccountMeta::new(p, false)
}
fn r(p: Pubkey) -> AccountMeta {
    AccountMeta::new_readonly(p, false)
}
fn s(p: Pubkey) -> AccountMeta {
    AccountMeta::new(p, true)
}
fn pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &ID).0
}
fn acct(owner: Pubkey, data: Vec<u8>) -> Account {
    Account {
        lamports: 10_000_000,
        owner,
        data,
        ..Default::default()
    }
}
fn ix(i: I, accounts: Vec<AccountMeta>) -> Instruction {
    Instruction {
        program_id: ID,
        accounts,
        data: borsh::to_vec(&i).unwrap(),
    }
}
fn sol(from: Pubkey, to: Pubkey, amount: u64) -> Instruction {
    Instruction {
        program_id: SYS,
        accounts: vec![s(from), w(to)],
        data: [2u32.to_le_bytes().as_slice(), &amount.to_le_bytes()].concat(),
    }
}

struct Bank {
    vm: Mollusk,
    accounts: BTreeMap<Pubkey, Account>,
}
impl Bank {
    fn new() -> Self {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
        let mut vm = Mollusk::new(
            &ID,
            root.join("target/deploy/creator_inbox").to_str().unwrap(),
        );
        mollusk_svm_programs_token::token::add_program(&mut vm);
        let mut accounts = BTreeMap::new();
        accounts.insert(
            SYS,
            Account {
                lamports: 1,
                owner: solana_sdk_ids::native_loader::ID,
                executable: true,
                ..Default::default()
            },
        );
        accounts.insert(
            TP,
            Account {
                lamports: 1,
                owner: solana_sdk_ids::bpf_loader::ID,
                executable: true,
                ..Default::default()
            },
        );
        let mut mint = vec![0; 82];
        mint[44] = 9;
        mint[45] = 1;
        accounts.insert(pk(WSOL), acct(TP, mint));
        Self { vm, accounts }
    }
    fn rent(&self, size: usize) -> u64 {
        self.vm.sysvars.rent.minimum_balance(size)
    }
    fn run(&mut self, instruction: Instruction, expected: Option<Error>) -> u64 {
        let inputs: BTreeMap<_, _> = instruction
            .accounts
            .iter()
            .map(|m| {
                (
                    m.pubkey,
                    self.accounts.get(&m.pubkey).cloned().unwrap_or_default(),
                )
            })
            .collect();
        let result = self.vm.process_instruction(
            &instruction,
            &inputs.clone().into_iter().collect::<Vec<_>>(),
        );
        if let Some(error) = expected {
            assert_eq!(
                result.program_result,
                ProgramResult::Failure(pinocchio::error::ProgramError::Custom(error as u32))
            );
            // Assert the SVM's rollback, not just the harness refusing to commit.
            for (k, a) in result.resulting_accounts {
                assert_eq!(a, inputs[&k], "changed {k} on failure");
            }
        } else {
            assert_eq!(result.program_result, ProgramResult::Success);
            for (k, a) in result.resulting_accounts {
                self.accounts.insert(k, a);
            }
        }
        result.compute_units_consumed
    }
    fn read<T: State>(&self, k: Pubkey) -> T {
        T::try_from_slice(&self.accounts[&k].data[8..]).unwrap()
    }
    fn put<T: State>(&mut self, k: Pubkey, state: &T) {
        self.accounts.get_mut(&k).unwrap().data =
            [T::TAG.as_slice(), &borsh::to_vec(state).unwrap()].concat();
    }
}

struct Fixture {
    b: Bank,
    payer: Pubkey,
    manager: Pubkey,
    root: Pubkey,
    pool: Pubkey,
    reserve: Pubkey,
    mint: Pubkey,
    launch: Pubkey,
    inbox: Pubkey,
    source: Pubkey,
    scratch: Pubkey,
}
impl Fixture {
    fn unregistered(prefund: u64) -> Self {
        let mut b = Bank::new();
        let payer = Pubkey::new_unique();
        let manager = Pubkey::new_unique();
        b.accounts.insert(
            payer,
            Account {
                lamports: 50_000_000_000,
                ..Default::default()
            },
        );
        b.accounts.insert(manager, acct(SYS, vec![]));
        let pool = Pubkey::new_unique();
        let reserve = Pubkey::new_unique();
        let mut stake_data = vec![0; 200];
        stake_data[..4].copy_from_slice(&1u32.to_le_bytes());
        b.accounts.insert(reserve, acct(pk(STAKE), stake_data));
        let mut pool_data = vec![0; 611];
        pool_data[0] = 1;
        pool_data[1..33].copy_from_slice(manager.as_ref());
        pool_data[130..162].copy_from_slice(reserve.as_ref());
        pool_data[162..194].copy_from_slice(Pubkey::new_unique().as_ref());
        pool_data[226..258].copy_from_slice(TOKEN_2022.as_ref());
        pool_data[266..274].copy_from_slice(&1_000_000_000u64.to_le_bytes());
        b.accounts.insert(pool, acct(pk(SANCTUM), pool_data));
        let root = pda(&[ROOT_SEED, pool.as_ref()]);
        b.run(
            ix(
                I::InitializeCreator,
                vec![
                    s(payer),
                    r(manager).signer(),
                    w(root),
                    r(pool),
                    r(reserve),
                    r(SYS),
                ],
            ),
            None,
        );
        let mint = Pubkey::new_unique();
        let inbox = pda(&[INBOX_SEED, root.as_ref(), mint.as_ref()]);
        let (launch, bump) =
            Pubkey::find_program_address(&[b"pool", mint.as_ref(), WSOL.as_ref()], &pk(LAUNCHLAB));
        let mut data = vec![0; 429];
        data[..8].copy_from_slice(&LAUNCH_POOL_TAG);
        data[16] = bump;
        data[18] = 6;
        data[19] = 9;
        data[20] = 1;
        data[21..29].copy_from_slice(&1_000_000_000_000_000u64.to_le_bytes());
        data[29..37].copy_from_slice(&793_100_000_000_000u64.to_le_bytes());
        data[141..173].copy_from_slice(STONK_SOL_CONFIG.as_ref());
        data[173..205].copy_from_slice(STONK_STANDARD.as_ref());
        data[205..237].copy_from_slice(mint.as_ref());
        data[237..269].copy_from_slice(WSOL.as_ref());
        data[333..365].copy_from_slice(inbox.as_ref());
        b.accounts.insert(launch, acct(pk(LAUNCHLAB), data));
        let mut m = vec![0; 82];
        m[44] = 6;
        m[45] = 1;
        b.accounts.insert(mint, acct(pk(TOKEN_2022), m));
        if prefund > 0 {
            b.run(sol(payer, inbox, prefund), None);
        }
        let source =
            Pubkey::find_program_address(&[inbox.as_ref(), TP.as_ref(), WSOL.as_ref()], &pk(ATA)).0;
        let scratch = pda(&[UNWRAP_SEED, inbox.as_ref()]);
        Self {
            b,
            payer,
            manager,
            root,
            pool,
            reserve,
            mint,
            launch,
            inbox,
            source,
            scratch,
        }
    }
    fn new() -> Self {
        let mut f = Self::unregistered(0);
        f.register(None);
        f
    }
    fn register(&mut self, error: Option<Error>) {
        self.b.run(
            ix(
                I::RegisterStonk,
                vec![
                    s(self.payer),
                    r(self.root),
                    w(self.inbox),
                    r(self.mint),
                    r(self.launch),
                    r(SYS),
                ],
            ),
            error,
        );
    }
    fn metas(&self) -> Vec<AccountMeta> {
        vec![w(self.root), w(self.inbox), r(self.pool), w(self.reserve)]
    }
    fn settle(&mut self) {
        let cu = self.b.run(ix(I::SettleSol, self.metas()), None);
        eprintln!("settle SOL: {cu} CU");
    }
    fn contribute(&mut self, amount: u64) {
        self.b.run(sol(self.payer, self.inbox, amount), None);
    }
    fn ws(&self) -> Instruction {
        let mut a = self.metas();
        a.extend([
            s(self.payer),
            w(self.source),
            w(self.scratch),
            r(pk(WSOL)),
            r(TP),
            r(SYS),
        ]);
        ix(I::SettleWsol, a)
    }
    fn wsol_account(&mut self, amount: u64) {
        let rent = self.b.rent(165);
        let mut d = vec![0; 165];
        d[..32].copy_from_slice(WSOL.as_ref());
        d[32..64].copy_from_slice(self.inbox.as_ref());
        d[64..72].copy_from_slice(&amount.to_le_bytes());
        d[108] = 1;
        d[109..113].copy_from_slice(&1u32.to_le_bytes());
        d[113..121].copy_from_slice(&rent.to_le_bytes());
        self.b.accounts.insert(
            self.source,
            Account {
                lamports: rent + amount,
                owner: TP,
                data: d,
                ..Default::default()
            },
        );
    }
    fn credited(&self) -> u128 {
        self.b.read::<Inbox>(self.inbox).contributed_lamports
    }
}
trait SignerMeta {
    fn signer(self) -> Self;
}
impl SignerMeta for AccountMeta {
    fn signer(mut self) -> Self {
        self.is_signer = true;
        self
    }
}

#[test]
fn external_distribution_then_settlement_is_counted_exactly_once() {
    let mut f = Fixture::new();
    let reserve_before = f.b.accounts[&f.reserve].lamports;
    // An unrelated transaction pays first. No wrapper/callback is involved.
    f.contribute(2_000_000_000);
    assert_eq!(f.credited(), 0);
    f.settle();
    f.settle();
    assert_eq!(f.credited(), 2_000_000_000);
    assert_eq!(
        f.b.read::<Creator>(f.root).contributed_lamports,
        f.credited()
    );
    assert_eq!(
        f.b.accounts[&f.reserve].lamports,
        reserve_before + 2_000_000_000
    );
    assert_eq!(f.b.accounts[&f.inbox].lamports, f.b.rent(Inbox::SPACE));
    f.contribute(9);
    f.settle();
    assert_eq!(f.credited(), 2_000_000_009);
}

#[test]
fn prefunding_inbox_does_not_block_registration() {
    for amount in [1, 1_000_000_000] {
        let mut f = Fixture::unregistered(amount);
        let before = f.b.accounts[&f.payer].lamports;
        f.register(None);
        f.settle();
        let rent = f.b.rent(Inbox::SPACE);
        assert_eq!(f.credited(), amount.saturating_sub(rent) as u128);
        assert_eq!(
            before - f.b.accounts[&f.payer].lamports,
            rent.saturating_sub(amount)
        );
        f.register(Some(Error::AlreadyInitialized));
    }
}

#[test]
fn wsol_unwrap_keeps_receiver_open_and_refunds_only_actual_rent() {
    for prefund in [0, 1, 5_000_000] {
        let mut f = Fixture::new();
        f.wsol_account(1_000_000_000);
        f.contribute(30);
        // A direct SOL transfer to the token account must also be recognized.
        f.b.run(sol(f.payer, f.source, 40), None);
        if prefund > 0 {
            f.b.run(sol(f.payer, f.scratch, prefund), None);
        }
        let before = f.b.accounts[&f.payer].lamports;
        let reserve_before = f.b.accounts[&f.reserve].lamports;
        let cu = f.b.run(f.ws(), None);
        eprintln!("settle WSOL: {cu} CU");
        assert_eq!(f.b.accounts[&f.payer].lamports, before);
        assert_eq!(f.credited(), 1_000_000_070 + prefund as u128);
        assert_eq!(
            f.b.accounts[&f.reserve].lamports - reserve_before,
            f.credited() as u64
        );
        assert_eq!(f.b.accounts[&f.source].lamports, f.b.rent(165));
        assert_eq!(f.b.accounts[&f.source].owner, TP);
        assert_eq!(f.b.accounts[&f.source].data.len(), 165);
        assert_eq!(f.b.accounts[&f.scratch].lamports, 0);
        let credited = f.credited();
        f.b.run(f.ws(), None);
        assert_eq!(f.credited(), credited);
    }
}

#[test]
fn invalid_creator_reserve_or_root_cannot_redirect_funds() {
    let mut f = Fixture::new();
    f.contribute(100);
    let mut a = f.metas();
    a[3] = w(f.payer);
    f.b.run(ix(I::SettleSol, a), Some(Error::InvalidAccount));
    let other = Pubkey::new_unique();
    f.b.accounts.insert(other, f.b.accounts[&f.root].clone());
    let mut a = f.metas();
    a[0] = w(other);
    f.b.run(ix(I::SettleSol, a), Some(Error::InvalidPda));
    let mut c: Creator = f.b.read(f.root);
    c.reserve = f.payer.to_bytes();
    f.b.put(f.root, &c);
    let mut a = f.metas();
    a[3] = w(f.payer);
    f.b.run(ix(I::SettleSol, a), Some(Error::InvalidStakePool));
}

#[test]
fn failed_accounting_rolls_back_unwrap_cpis_and_rent() {
    let mut f = Fixture::new();
    f.wsol_account(1_000_000_000);
    let mut c: Creator = f.b.read(f.root);
    c.contributed_lamports = u128::MAX;
    f.b.put(f.root, &c);
    f.b.run(f.ws(), Some(Error::ArithmeticOverflow));
    assert_eq!(
        f.b.accounts[&f.source].lamports,
        f.b.rent(165) + 1_000_000_000
    );
    assert_eq!(f.credited(), 0);
}

#[test]
fn native_overflows_and_readonly_accounts_leave_money_untouched() {
    let mut f = Fixture::new();
    f.contribute(1);
    for index in [0, 1, 3] {
        let mut a = f.metas();
        a[index].is_writable = false;
        f.b.run(ix(I::SettleSol, a), Some(Error::NotWritable));
    }
    let mut i: Inbox = f.b.read(f.inbox);
    i.contributed_lamports = u128::MAX;
    f.b.put(f.inbox, &i);
    f.b.run(ix(I::SettleSol, f.metas()), Some(Error::ArithmeticOverflow));
}

#[test]
fn registration_requires_real_standard_stonk_pool_pointing_at_this_inbox() {
    for offset in [0, 16, 18, 19, 20, 21, 29, 101, 141, 173, 205, 237, 333] {
        let mut f = Fixture::unregistered(0);
        f.b.accounts.get_mut(&f.launch).unwrap().data[offset] ^= 1;
        f.register(Some(Error::InvalidLaunch));
    }
    let mut f = Fixture::unregistered(0);
    f.b.accounts.get_mut(&f.launch).unwrap().owner = SYS;
    f.register(Some(Error::InvalidLaunch));
    let mut f = Fixture::unregistered(0);
    // An otherwise valid mint carrying a TransferFeeConfig is not standard mode.
    let m = &mut f.b.accounts.get_mut(&f.mint).unwrap().data;
    m.resize(278, 0);
    m[165] = 1;
    m[166..168].copy_from_slice(&1u16.to_le_bytes());
    m[168..170].copy_from_slice(&108u16.to_le_bytes());
    f.register(Some(Error::InvalidLaunch));
}

#[test]
fn wsol_requires_fixed_ata_native_mint_and_signer() {
    let mut f = Fixture::new();
    f.wsol_account(10);
    let mut i = f.ws();
    i.accounts[4].is_signer = false;
    f.b.run(i, Some(Error::Unauthorized));
    let mut i = f.ws();
    i.accounts[6] = w(f.inbox);
    f.b.run(i, Some(Error::InvalidAccount));
    for offset in [0, 32, 72, 108, 109, 129] {
        let mut f = Fixture::new();
        f.wsol_account(10);
        f.b.accounts.get_mut(&f.source).unwrap().data[offset] ^= 1;
        f.b.run(f.ws(), Some(Error::InvalidTokenAccount));
    }
}

#[test]
fn creator_initialization_requires_pool_manager_and_survives_prefunding() {
    let mut f = Fixture::new();
    // New root address: same trusted pool prefix, a different pool account.
    let pool = Pubkey::new_unique();
    f.b.accounts.insert(pool, f.b.accounts[&f.pool].clone());
    let root = pda(&[ROOT_SEED, pool.as_ref()]);
    f.b.run(sol(f.payer, root, 1), None);
    let a = vec![
        s(f.payer),
        s(f.payer),
        w(root),
        r(pool),
        r(f.reserve),
        r(SYS),
    ];
    f.b.run(ix(I::InitializeCreator, a), Some(Error::Unauthorized));
    let a = vec![
        s(f.payer),
        r(f.manager).signer(),
        w(root),
        r(pool),
        r(f.reserve),
        r(SYS),
    ];
    f.b.run(ix(I::InitializeCreator, a), None);
    assert_eq!(f.b.read::<Creator>(root).contributed_lamports, 0);
}

#[test]
fn donation_to_shared_reserve_is_not_falsely_attributed() {
    let mut f = Fixture::new();
    f.b.run(sol(f.payer, f.reserve, 1_000_000), None);
    f.settle();
    assert_eq!(f.credited(), 0);
    assert_eq!(f.b.read::<Creator>(f.root).contributed_lamports, 0);
}

#[test]
fn independent_memes_contribute_to_one_creator_without_cross_credit() {
    let mut f = Fixture::new();
    let mint = Pubkey::new_unique();
    let inbox = pda(&[INBOX_SEED, f.root.as_ref(), mint.as_ref()]);
    let (launch, bump) =
        Pubkey::find_program_address(&[b"pool", mint.as_ref(), WSOL.as_ref()], &pk(LAUNCHLAB));
    let mut pool_account = f.b.accounts[&f.launch].clone();
    pool_account.data[16] = bump;
    pool_account.data[205..237].copy_from_slice(mint.as_ref());
    pool_account.data[333..365].copy_from_slice(inbox.as_ref());
    f.b.accounts.insert(launch, pool_account);
    f.b.accounts.insert(mint, f.b.accounts[&f.mint].clone());
    f.b.run(
        ix(
            I::RegisterStonk,
            vec![s(f.payer), r(f.root), w(inbox), r(mint), r(launch), r(SYS)],
        ),
        None,
    );
    f.contribute(300);
    f.b.run(sol(f.payer, inbox, 700), None);
    f.b.run(
        ix(
            I::SettleSol,
            vec![w(f.root), w(inbox), r(f.pool), w(f.reserve)],
        ),
        None,
    );
    assert_eq!(f.credited(), 0);
    assert_eq!(f.b.read::<Inbox>(inbox).contributed_lamports, 700);
    f.settle();
    assert_eq!(f.credited(), 300);
    assert_eq!(f.b.read::<Creator>(f.root).contributed_lamports, 1_000);
}

#[test]
fn depleted_or_rebound_stake_pool_cannot_receive_settlement() {
    for offset in [0, 130, 162, 226] {
        let mut f = Fixture::new();
        f.contribute(100);
        f.b.accounts.get_mut(&f.pool).unwrap().data[offset] ^= 1;
        f.b.run(ix(I::SettleSol, f.metas()), Some(Error::InvalidStakePool));
    }
    let mut f = Fixture::new();
    f.contribute(100);
    f.b.accounts.get_mut(&f.pool).unwrap().data[266..274].fill(0);
    f.b.run(ix(I::SettleSol, f.metas()), Some(Error::InvalidStakePool));
}
