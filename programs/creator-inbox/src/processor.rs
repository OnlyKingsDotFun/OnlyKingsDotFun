use crate::{state::*, Error as E, Instruction};
use borsh::BorshDeserialize;
use pinocchio::{
    cpi::{Seed, Signer},
    error::ProgramError,
    sysvars::{rent::Rent, Sysvar},
    AccountView, Address, ProgramResult,
};
use pinocchio_system::instructions::{Allocate, Assign, CreateAccount, Transfer as SolTransfer};
use pinocchio_token::instructions::{CloseAccount, InitializeAccount3, SyncNative, Transfer};

type Result<T> = core::result::Result<T, ProgramError>;
fn require(value: bool, error: E) -> ProgramResult {
    if value {
        Ok(())
    } else {
        Err(error.into())
    }
}
fn writable(a: &AccountView) -> ProgramResult {
    require(a.is_writable(), E::NotWritable)
}
fn signer(a: &AccountView) -> ProgramResult {
    require(a.is_signer(), E::Unauthorized)
}
fn program(a: &AccountView, id: &Address) -> ProgramResult {
    require(a.address() == id && a.executable(), E::InvalidAccount)
}
fn key(a: &AccountView) -> Key {
    a.address().to_bytes()
}
fn pda(a: &AccountView, id: &Address, seeds: &[&[u8]]) -> Result<u8> {
    let (expected, bump) = Address::find_program_address(seeds, id);
    require(a.address() == &expected, E::InvalidPda)?;
    Ok(bump)
}
fn load<T: State>(a: &AccountView, id: &Address) -> Result<T> {
    require(a.owned_by(id) && a.data_len() == T::SPACE, E::InvalidState)?;
    let d = a.try_borrow()?;
    require(d[..8] == T::TAG && d[8] == VERSION, E::InvalidState)?;
    T::try_from_slice(&d[8..]).map_err(|_| E::InvalidState.into())
}
fn save<T: State>(a: &mut AccountView, s: &T) -> ProgramResult {
    writable(a)?;
    let mut d = a.try_borrow_mut()?;
    require(d.len() == T::SPACE, E::InvalidState)?;
    d[..8].copy_from_slice(&T::TAG);
    s.serialize(&mut &mut d[8..])
        .map_err(|_| ProgramError::InvalidAccountData)
}
fn creator(a: &AccountView, id: &Address) -> Result<Creator> {
    let c: Creator = load(a, id)?;
    require(
        pda(a, id, &[ROOT_SEED, &c.stake_pool])? == c.bump,
        E::InvalidPda,
    )?;
    Ok(c)
}

/// Allocate prefunded PDAs without losing the unsolicited deposit or blocking init.
/// Returns exactly the lamports contributed by `payer` to rent-exempt creation.
fn create(
    payer: &AccountView,
    target: &AccountView,
    owner: &Address,
    space: usize,
    seeds: &[Seed],
) -> Result<u64> {
    signer(payer)?;
    writable(payer)?;
    writable(target)?;
    require(payer.address() != target.address(), E::InvalidAccount)?;
    require(
        target.owned_by(&pinocchio_system::ID) && target.data_len() == 0,
        E::AlreadyInitialized,
    )?;
    let rent = Rent::get()?.try_minimum_balance(space)?;
    let funded = rent.saturating_sub(target.lamports());
    let signers = [Signer::from(seeds)];
    if target.lamports() == 0 {
        CreateAccount {
            from: payer,
            to: target,
            lamports: rent,
            space: space as u64,
            owner,
        }
        .invoke_signed(&signers)?;
    } else {
        if funded > 0 {
            SolTransfer {
                from: payer,
                to: target,
                lamports: funded,
            }
            .invoke()?;
        }
        Allocate {
            account: target,
            space: space as u64,
        }
        .invoke_signed(&signers)?;
        Assign {
            account: target,
            owner,
        }
        .invoke_signed(&signers)?;
    }
    Ok(funded)
}

/// Stable Borsh prefix from Sanctum's stake-pool state (SP12 deployment).
/// No caller-supplied reserve, manager, or mint is trusted without this binding.
fn stake_pool(pool: &AccountView, reserve: &AccountView) -> Result<(Key, Key)> {
    require(pool.owned_by(&SANCTUM), E::InvalidStakePool)?;
    let d = pool.try_borrow()?;
    require(d.len() >= 282 && d[0] == 1, E::InvalidStakePool)?;
    require(d[130..162] == key(reserve), E::InvalidStakePool)?;
    require(
        d[226..258] == pinocchio_token::ID.to_bytes() || d[226..258] == TOKEN_2022.to_bytes(),
        E::InvalidStakePool,
    )?;
    // Do not donate into a pool with no outstanding LST claims.
    require(
        u64::from_le_bytes(d[266..274].try_into().unwrap()) > 0,
        E::InvalidStakePool,
    )?;
    require(
        reserve.owned_by(&STAKE) && !reserve.executable(),
        E::InvalidStakePool,
    )?;
    let r = reserve.try_borrow()?;
    require(
        r.len() == 200 && r[..4] == 1u32.to_le_bytes(),
        E::InvalidStakePool,
    )?;
    Ok((
        d[1..33].try_into().unwrap(),
        d[162..194].try_into().unwrap(),
    ))
}

pub fn process_instruction(
    id: &Address,
    accounts: &mut [AccountView],
    data: &[u8],
) -> ProgramResult {
    let ix = Instruction::try_from_slice(data).map_err(|_| ProgramError::InvalidInstructionData)?;
    match ix {
        Instruction::InitializeCreator => initialize(id, accounts),
        Instruction::RegisterStonk => register(id, accounts),
        Instruction::SettleSol => {
            require(accounts.len() == 4, E::InvalidAccount)?;
            settle(id, accounts)
        }
        Instruction::SettleWsol => settle_wsol(id, accounts),
    }
}

fn initialize(id: &Address, a: &mut [AccountView]) -> ProgramResult {
    let [payer, manager, root, pool, reserve, sys] = a else {
        return Err(E::InvalidAccount.into());
    };
    program(sys, &pinocchio_system::ID)?;
    signer(manager)?;
    let (pool_manager, lst_mint) = stake_pool(pool, reserve)?;
    require(pool_manager == key(manager), E::Unauthorized)?;
    let pool_key = key(pool);
    let bump = pda(root, id, &[ROOT_SEED, &pool_key])?;
    let bump_seed = [bump];
    create(
        payer,
        root,
        id,
        Creator::SPACE,
        &[
            Seed::from(ROOT_SEED),
            Seed::from(&pool_key),
            Seed::from(&bump_seed),
        ],
    )?;
    save(
        root,
        &Creator {
            version: VERSION,
            bump,
            stake_pool: pool_key,
            reserve: key(reserve),
            lst_mint,
            contributed_lamports: 0,
        },
    )
}

/// Check real LaunchLab state. Registration is permissionless, but it cannot
/// attribute someone else's launch to this inbox or substitute another creator.
fn stonk_launch(pool: &AccountView, mint: &AccountView, inbox: &AccountView) -> ProgramResult {
    require(
        pool.owned_by(&LAUNCHLAB) && mint.owned_by(&TOKEN_2022),
        E::InvalidLaunch,
    )?;
    let bump = pda(
        pool,
        &LAUNCHLAB,
        &[b"pool", mint.address().as_ref(), WSOL.as_ref()],
    )?;
    let d = pool.try_borrow()?;
    require(
        d.len() >= 429 && d[..8] == LAUNCH_POOL_TAG && d[16] == bump,
        E::InvalidLaunch,
    )?;
    require(d[18] == 6 && d[19] == 9 && d[20] == 1, E::InvalidLaunch)?;
    require(
        d[21..29] == 1_000_000_000_000_000u64.to_le_bytes()
            && d[29..37] == 793_100_000_000_000u64.to_le_bytes(),
        E::InvalidLaunch,
    )?;
    require(d[101..125].iter().all(|b| *b == 0), E::InvalidLaunch)?;
    require(
        d[141..173] == STONK_SOL_CONFIG.to_bytes()
            && d[173..205] == STONK_STANDARD.to_bytes()
            && d[205..237] == key(mint)
            && d[237..269] == WSOL.to_bytes()
            && d[333..365] == key(inbox),
        E::InvalidLaunch,
    )?;
    let m = mint.try_borrow()?;
    require(m.len() >= 82 && m[44] == 6 && m[45] == 1, E::InvalidLaunch)?;
    if m.len() > 82 {
        require(m.len() > 165 && m[165] == 1, E::InvalidLaunch)?;
        // Token-2022 TLV: standard Stonk launches must have no transfer fee.
        let mut rest = &m[166..];
        while !rest.is_empty() {
            if rest.iter().all(|b| *b == 0) {
                break;
            }
            require(rest.len() >= 4, E::InvalidLaunch)?;
            let ty = u16::from_le_bytes(rest[..2].try_into().unwrap());
            let len = u16::from_le_bytes(rest[2..4].try_into().unwrap()) as usize;
            require(
                ty != 0 && ty != 1 && len <= rest.len() - 4,
                E::InvalidLaunch,
            )?;
            rest = &rest[4 + len..];
        }
    }
    Ok(())
}

fn register(id: &Address, a: &mut [AccountView]) -> ProgramResult {
    let [payer, root, inbox, mint, launch, sys] = a else {
        return Err(E::InvalidAccount.into());
    };
    program(sys, &pinocchio_system::ID)?;
    creator(root, id)?;
    let root_key = key(root);
    let meme_mint = key(mint);
    let bump = pda(inbox, id, &[INBOX_SEED, &root_key, &meme_mint])?;
    stonk_launch(launch, mint, inbox)?;
    let bump_seed = [bump];
    create(
        payer,
        inbox,
        id,
        Inbox::SPACE,
        &[
            Seed::from(INBOX_SEED),
            Seed::from(&root_key),
            Seed::from(&meme_mint),
            Seed::from(&bump_seed),
        ],
    )?;
    save(
        inbox,
        &Inbox {
            version: VERSION,
            bump,
            creator: root_key,
            meme_mint,
            launch_pool: key(launch),
            contributed_lamports: 0,
        },
    )
}

fn bindings(id: &Address, a: &[AccountView]) -> Result<(Creator, Inbox)> {
    let [root, inbox, pool, reserve, ..] = a else {
        return Err(E::InvalidAccount.into());
    };
    writable(root)?;
    writable(inbox)?;
    writable(reserve)?;
    let c = creator(root, id)?;
    let i: Inbox = load(inbox, id)?;
    require(
        i.creator == key(root) && c.stake_pool == key(pool) && c.reserve == key(reserve),
        E::InvalidAccount,
    )?;
    require(
        pda(inbox, id, &[INBOX_SEED, &i.creator, &i.meme_mint])? == i.bump,
        E::InvalidPda,
    )?;
    require(
        stake_pool(pool, reserve)?.1 == c.lst_mint,
        E::InvalidStakePool,
    )?;
    Ok((c, i))
}

fn settle(id: &Address, a: &mut [AccountView]) -> ProgramResult {
    let (mut c, mut i) = bindings(id, a)?;
    let [root, inbox, _, reserve, ..] = a else {
        unreachable!()
    };
    let rent = Rent::get()?.try_minimum_balance(Inbox::SPACE)?;
    let amount = inbox.lamports().checked_sub(rent).ok_or(E::InvalidState)?;
    if amount == 0 {
        return Ok(());
    }
    // Check every arithmetic operation before changing any account.
    c.contributed_lamports = c
        .contributed_lamports
        .checked_add(amount as u128)
        .ok_or(E::ArithmeticOverflow)?;
    i.contributed_lamports = i
        .contributed_lamports
        .checked_add(amount as u128)
        .ok_or(E::ArithmeticOverflow)?;
    let destination = reserve
        .lamports()
        .checked_add(amount)
        .ok_or(E::ArithmeticOverflow)?;
    save(root, &c)?;
    save(inbox, &i)?;
    inbox.set_lamports(rent);
    reserve.set_lamports(destination);
    Ok(())
}

fn settle_wsol(id: &Address, a: &mut [AccountView]) -> ProgramResult {
    require(a.len() == 10, E::InvalidAccount)?;
    // All roles here are distinct, including rent payer and program-controlled funds.
    for (n, account) in a.iter().enumerate() {
        require(
            a[..n]
                .iter()
                .all(|other| other.address() != account.address()),
            E::InvalidAccount,
        )?;
    }
    let (_, i) = bindings(id, a)?;
    let [_, inbox, _, _, payer, source, scratch, mint, token, sys] = a else {
        unreachable!()
    };
    signer(payer)?;
    writable(payer)?;
    writable(source)?;
    writable(scratch)?;
    program(sys, &pinocchio_system::ID)?;
    program(token, &pinocchio_token::ID)?;
    require(
        mint.address() == &WSOL && mint.owned_by(&pinocchio_token::ID),
        E::InvalidTokenAccount,
    )?;
    pda(
        source,
        &ATA,
        &[
            inbox.address().as_ref(),
            pinocchio_token::ID.as_ref(),
            WSOL.as_ref(),
        ],
    )?;
    require(
        source.owned_by(&pinocchio_token::ID),
        E::InvalidTokenAccount,
    )?;
    {
        let d = source.try_borrow()?;
        require(
            d.len() == 165
                && d[..32] == WSOL.to_bytes()
                && d[32..64] == key(inbox)
                && d[108] == 1
                && d[109..113] == 1u32.to_le_bytes()
                && d[72..76] == [0; 4]
                && d[129..133] == [0; 4],
            E::InvalidTokenAccount,
        )?;
    }
    let inbox_key = key(inbox);
    let bump = pda(scratch, id, &[UNWRAP_SEED, &inbox_key])?;
    // Capture direct SOL sent to the WSOL account too. Its rent is never credited.
    SyncNative::new(source, None).invoke()?;
    let amount = {
        let d = source.try_borrow()?;
        u64::from_le_bytes(d[64..72].try_into().unwrap())
    };
    let bump_seed = [bump];
    let funded = create(
        payer,
        scratch,
        &pinocchio_token::ID,
        165,
        &[
            Seed::from(UNWRAP_SEED),
            Seed::from(&inbox_key),
            Seed::from(&bump_seed),
        ],
    )?;
    InitializeAccount3::new(scratch, mint, inbox.address()).invoke()?;
    let inbox_bump = [i.bump];
    let seeds = [
        Seed::from(INBOX_SEED),
        Seed::from(&i.creator),
        Seed::from(&i.meme_mint),
        Seed::from(&inbox_bump),
    ];
    let signers = [Signer::from(&seeds[..])];
    Transfer::new(source, scratch, inbox, amount).invoke_signed(&signers)?;
    CloseAccount::new(scratch, inbox, inbox).invoke_signed(&signers)?;
    // Refund only this instruction's actual rent advance. Prefunded scratch SOL
    // remains a donation; callers cannot turn it into a rent reimbursement.
    let refunded = payer
        .lamports()
        .checked_add(funded)
        .ok_or(E::ArithmeticOverflow)?;
    let remaining = inbox
        .lamports()
        .checked_sub(funded)
        .ok_or(E::ArithmeticOverflow)?;
    payer.set_lamports(refunded);
    inbox.set_lamports(remaining);
    // Includes any SOL waiting before this call. Overflow/failure rolls back CPIs too.
    settle(id, a)
}
