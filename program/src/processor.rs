use crate::{
    accounts::*,
    error::{AmmError as E, Result},
    instruction::AmmInstruction as I,
    math,
    state::*,
    tokens,
};
use borsh::BorshDeserialize;
use pinocchio::{cpi::Seed, error::ProgramError, AccountView, Address, ProgramResult};

pub fn process_instruction(id: &Address, a: &mut [AccountView], data: &[u8]) -> ProgramResult {
    let ix = I::try_from_slice(data).map_err(|_| ProgramError::InvalidInstructionData)?;
    match ix {
        I::CreateAmmConfig { index, trade_fee_rate, protocol_fee_rate, fund_fee_rate, rebalance_fee_divisor } => {
            create_config(id, a, index, trade_fee_rate, protocol_fee_rate, fund_fee_rate, rebalance_fee_divisor)
        }
        I::UpdateAmmConfig { param, value } => update_config(id, a, param, value),
        I::SetConfigOwner { new_owner } => {
            exact(a, 2)?;
            let mut c = config(&a[1], id)?;
            owner_of(&a[0], &c)?;
            c.owner = new_owner;
            save(&mut a[1], &c)
        }
        I::InitializePool { nonce, curve, amp, open_time, n, rates } => initialize_pool(id, a, nonce, curve, amp, open_time, n, rates),
        I::Deposit { lp_amount, max_amounts } => deposit(id, a, lp_amount, max_amounts),
        I::Withdraw { lp_amount, min_amounts } => withdraw(id, a, lp_amount, min_amounts),
        I::Swap { in_index, out_index, amount_in, min_amount_out } => swap(id, a, in_index, out_index, amount_in, min_amount_out, false),
        I::RebalanceSwap { in_index, out_index, amount_in, min_amount_out } => swap(id, a, in_index, out_index, amount_in, min_amount_out, true),
        I::UpdateRates { rates } => {
            exact(a, 2)?;
            let mut p = pool(&a[1], id)?;
            signer(&a[0])?;
            require(key(&a[0]) == p.rate_authority, E::Unauthorized)?;
            for i in 0..p.n() {
                require(rates[i] > 0, E::InvalidAmount)?;
                p.rates[i] = rates[i];
            }
            save(&mut a[1], &p)
        }
        I::SetRateAuthority { new_authority } => {
            exact(a, 2)?;
            let mut p = pool(&a[1], id)?;
            signer(&a[0])?;
            require(key(&a[0]) == p.rate_authority, E::Unauthorized)?;
            p.rate_authority = new_authority;
            save(&mut a[1], &p)
        }
        I::SetPoolStatus { status } => {
            exact(a, 3)?;
            let c = config(&a[1], id)?;
            owner_of(&a[0], &c)?;
            let mut p = pool(&a[2], id)?;
            require(p.amm_config == key(&a[1]), E::InvalidState)?;
            p.status = status;
            save(&mut a[2], &p)
        }
        I::CollectFees { kind } => collect_fees(id, a, kind),
    }
}

fn owner_of(a: &AccountView, c: &AmmConfig) -> ProgramResult {
    signer(a)?;
    require(key(a) == c.owner, E::Unauthorized)
}
fn check_fees(trade: u64, protocol: u64, fund: u64) -> ProgramResult {
    require(trade <= MAX_TRADE_FEE, E::InvalidFee)?;
    require(protocol.checked_add(fund).ok_or(E::Arithmetic)? <= FEE_DENOM, E::InvalidFee)
}

fn create_config(id: &Address, a: &mut [AccountView], index: u16, trade: u64, protocol: u64, fund: u64, divisor: u32) -> ProgramResult {
    exact(a, 3)?;
    let (owner, cfg, sys) = (&a[0], &a[1], &a[2]);
    program(sys, &pinocchio_system::ID)?;
    signer(owner)?;
    check_fees(trade, protocol, fund)?;
    require(divisor >= 1, E::InvalidFee)?;
    let ok = key(owner);
    let ib = index.to_le_bytes();
    let bump = pda(cfg, id, &[CONFIG_SEED, &ok, &ib])?;
    let bb = [bump];
    create(owner, cfg, id, AmmConfig::SPACE, &[Seed::from(CONFIG_SEED), Seed::from(&ok[..]), Seed::from(&ib[..]), Seed::from(&bb[..])])?;
    save(
        &mut a[1],
        &AmmConfig {
            version: VERSION,
            bump,
            index,
            owner: ok,
            trade_fee_rate: trade,
            protocol_fee_rate: protocol,
            fund_fee_rate: fund,
            rebalance_fee_divisor: divisor,
            disable_create_pool: false,
        },
    )
}

fn update_config(id: &Address, a: &mut [AccountView], param: u8, value: u64) -> ProgramResult {
    exact(a, 2)?;
    let mut c = config(&a[1], id)?;
    owner_of(&a[0], &c)?;
    match param {
        0 => c.trade_fee_rate = value,
        1 => c.protocol_fee_rate = value,
        2 => c.fund_fee_rate = value,
        3 => c.rebalance_fee_divisor = u32::try_from(value).map_err(|_| E::InvalidFee)?,
        4 => c.disable_create_pool = value != 0,
        _ => return Err(ProgramError::InvalidInstructionData),
    }
    check_fees(c.trade_fee_rate, c.protocol_fee_rate, c.fund_fee_rate)?;
    require(c.rebalance_fee_divisor >= 1, E::InvalidFee)?;
    save(&mut a[1], &c)
}

#[allow(clippy::too_many_arguments)]
fn initialize_pool(id: &Address, a: &mut [AccountView], nonce: u64, curve: u8, amp: u64, open_time: u64, n: u8, rates: [u64; MAX_TOKENS]) -> ProgramResult {
    let n = n as usize;
    require((MIN_TOKENS..=MAX_TOKENS).contains(&n), E::InvalidTokenCount)?;
    exact(a, 9 + 2 * n)?;
    let (creator, cfg, auth, pool_acc, lp_mint, lp_tp, sys, tp, tp22) = (&a[0], &a[1], &a[2], &a[3], &a[4], &a[5], &a[6], &a[7], &a[8]);
    let c = config(cfg, id)?;
    require(!c.disable_create_pool, E::Disabled)?;
    program(sys, &pinocchio_system::ID)?;
    signer(creator)?;
    match curve {
        0 => require(amp == 0, E::InvalidCurve)?,
        1 => require((1..=1_000_000).contains(&amp), E::InvalidCurve)?,
        _ => return Err(E::InvalidCurve.into()),
    }
    let (auth_key, auth_bump) = Address::find_program_address(&[AUTH_SEED], id);
    require(auth.address() == &auth_key, E::InvalidPda)?;

    let ck = key(cfg);
    let crk = key(creator);
    let nb = nonce.to_le_bytes();
    let bump = pda(pool_acc, id, &[POOL_SEED, &ck, &crk, &nb])?;
    let bb = [bump];
    create(creator, pool_acc, id, PoolState::SPACE, &[Seed::from(POOL_SEED), Seed::from(&ck[..]), Seed::from(&crk[..]), Seed::from(&nb[..]), Seed::from(&bb[..])])?;
    let pk = key(pool_acc);

    let lp_bump = pda(lp_mint, id, &[LP_MINT_SEED, &pk])?;
    let lb = [lp_bump];
    tokens::create_mint(creator, lp_mint, lp_tp, LP_DECIMALS, &auth_key, &[Seed::from(LP_MINT_SEED), Seed::from(&pk[..]), Seed::from(&lb[..])])?;

    let mut p = PoolState {
        version: VERSION,
        bump,
        auth_bump,
        status: 0,
        curve,
        n: n as u8,
        amm_config: ck,
        creator: crk,
        rate_authority: crk,
        lp_mint: key(lp_mint),
        nonce,
        amp,
        open_time,
        ..Default::default()
    };
    for i in 0..n {
        let (m, v) = (&a[9 + 2 * i], &a[10 + 2 * i]);
        let mk = key(m);
        for j in 0..i {
            require(p.mints[j] != mk, E::DuplicateMint)?;
        }
        let mi = tokens::mint(m)?;
        require(rates[i] > 0, E::InvalidAmount)?;
        let vb = [pda(v, id, &[VAULT_SEED, &pk, &mk])?];
        let mtp = tokens::program_for(m, tp, tp22)?;
        tokens::create_vault(creator, v, m, mtp, &auth_key, &[Seed::from(VAULT_SEED), Seed::from(&pk[..]), Seed::from(&mk[..]), Seed::from(&vb[..])])?;
        p.mints[i] = mk;
        p.vaults[i] = key(v);
        p.decimals[i] = mi.decimals;
        p.rates[i] = rates[i];
    }
    save(&mut a[3], &p)
}

/// Common prelude for deposit/withdraw: validates the 3n token accounts and reserve cache.
struct Legs<'a> {
    mints: [&'a AccountView; MAX_TOKENS],
    users: [&'a AccountView; MAX_TOKENS],
    vaults: [&'a AccountView; MAX_TOKENS],
}
fn legs<'a>(a: &'a [AccountView], start: usize, p: &PoolState, auth: &Key) -> Result<Legs<'a>> {
    let n = p.n();
    exact(a, start + 3 * n)?;
    let mut l = Legs { mints: [&a[0]; MAX_TOKENS], users: [&a[0]; MAX_TOKENS], vaults: [&a[0]; MAX_TOKENS] };
    for i in 0..n {
        let (m, u, v) = (&a[start + 3 * i], &a[start + 3 * i + 1], &a[start + 3 * i + 2]);
        require(key(m) == p.mints[i], E::InvalidVault)?;
        tokens::user_token(u, &p.mints[i])?;
        let bal = tokens::vault(v, &p.vaults[i], &p.mints[i], auth)?;
        require(bal >= owed(p, i)?, E::ReserveMismatch)?;
        l.mints[i] = m;
        l.users[i] = u;
        l.vaults[i] = v;
    }
    Ok(l)
}
fn owed(p: &PoolState, i: usize) -> Result<u64> {
    p.reserves[i]
        .checked_add(p.protocol_fees_owed[i])
        .and_then(|x| x.checked_add(p.fund_fees_owed[i]))
        .ok_or(E::Arithmetic.into())
}
fn auth_seeds(bump: &[u8; 1]) -> [Seed<'_>; 2] {
    [Seed::from(AUTH_SEED), Seed::from(&bump[..])]
}

fn deposit(id: &Address, a: &mut [AccountView], lp_amount: u64, max_amounts: [u64; MAX_TOKENS]) -> ProgramResult {
    exact(a, 8)?;
    let (user, auth, pool_acc, lp_mint, user_lp, lp_tp, tp, tp22) = (&a[0], &a[1], &a[2], &a[3], &a[4], &a[5], &a[6], &a[7]);
    let mut p = pool(pool_acc, id)?;
    signer(user)?;
    require(p.status & STATUS_DEPOSIT_OFF == 0, E::Disabled)?;
    authority(auth, id, p.auth_bump)?;
    require(key(lp_mint) == p.lp_mint, E::InvalidState)?;
    program(lp_tp, &pinocchio_token::ID)?;
    tokens::user_token(user_lp, &p.lp_mint)?;
    let ak = key(auth);
    let l = legs(a, 8, &p, &ak)?;
    let n = p.n();
    let mut amounts = [0u64; MAX_TOKENS];
    let lp_out;
    if p.lp_supply == 0 {
        // First deposit sets the ratio. LP = total rate-adjusted value in 9 decimals, minus lock.
        let mut total_xp = 0u128;
        for i in 0..n {
            require(max_amounts[i] > 0, E::InvalidAmount)?;
            amounts[i] = max_amounts[i];
            total_xp = total_xp.checked_add(math::to_xp(amounts[i], p.decimals[i], p.rates[i])?).ok_or(E::Arithmetic)?;
        }
        let lp = u64::try_from(total_xp / 10u128.pow(math::PREC - u32::from(LP_DECIMALS))).map_err(|_| E::Arithmetic)?;
        require(lp > LOCKED_LP, E::InvalidAmount)?;
        lp_out = lp - LOCKED_LP;
        p.lp_supply = lp;
    } else {
        require(lp_amount > 0, E::InvalidAmount)?;
        for i in 0..n {
            amounts[i] = math::mul_div_ceil(lp_amount, p.reserves[i], p.lp_supply)?;
            require(amounts[i] > 0 && amounts[i] <= max_amounts[i], E::SlippageExceeded)?;
        }
        lp_out = lp_amount;
        p.lp_supply = p.lp_supply.checked_add(lp_amount).ok_or(E::Arithmetic)?;
    }
    for i in 0..n {
        let mtp = tokens::program_for(l.mints[i], tp, tp22)?;
        let before = tokens::amount(l.vaults[i])?;
        tokens::transfer(l.users[i], l.mints[i], l.vaults[i], user, mtp, amounts[i], &[])?;
        // Credit what actually arrived (Token-2022 transfer fees reduce it).
        let got = tokens::amount(l.vaults[i])?.checked_sub(before).ok_or(E::Arithmetic)?;
        p.reserves[i] = p.reserves[i].checked_add(got).ok_or(E::Arithmetic)?;
    }
    let bump = [p.auth_bump];
    tokens::mint_to(lp_mint, user_lp, auth, lp_tp, lp_out, &auth_seeds(&bump))?;
    save(&mut a[2], &p)
}

fn withdraw(id: &Address, a: &mut [AccountView], lp_amount: u64, min_amounts: [u64; MAX_TOKENS]) -> ProgramResult {
    exact(a, 8)?;
    let (user, auth, pool_acc, lp_mint, user_lp, lp_tp, tp, tp22) = (&a[0], &a[1], &a[2], &a[3], &a[4], &a[5], &a[6], &a[7]);
    let mut p = pool(pool_acc, id)?;
    signer(user)?;
    require(p.status & STATUS_WITHDRAW_OFF == 0, E::Disabled)?;
    authority(auth, id, p.auth_bump)?;
    require(key(lp_mint) == p.lp_mint, E::InvalidState)?;
    program(lp_tp, &pinocchio_token::ID)?;
    tokens::user_token(user_lp, &p.lp_mint)?;
    require(lp_amount > 0 && lp_amount <= p.lp_supply.saturating_sub(LOCKED_LP), E::InvalidAmount)?;
    let ak = key(auth);
    let l = legs(a, 8, &p, &ak)?;
    let n = p.n();
    let bump = [p.auth_bump];
    let seeds = auth_seeds(&bump);
    tokens::burn(user_lp, lp_mint, user, lp_tp, lp_amount)?;
    for i in 0..n {
        let out = math::mul_div_floor(lp_amount, p.reserves[i], p.lp_supply)?;
        require(out >= min_amounts[i], E::SlippageExceeded)?;
        p.reserves[i] = p.reserves[i].checked_sub(out).ok_or(E::Arithmetic)?;
        if out > 0 {
            let mtp = tokens::program_for(l.mints[i], tp, tp22)?;
            tokens::transfer(l.vaults[i], l.mints[i], l.users[i], auth, mtp, out, &seeds)?;
        }
    }
    p.lp_supply -= lp_amount;
    save(&mut a[2], &p)
}

#[allow(clippy::too_many_arguments)]
fn swap(id: &Address, a: &mut [AccountView], i: u8, j: u8, amount_in: u64, min_out: u64, rebalance: bool) -> ProgramResult {
    exact(a, 12)?;
    let (user, auth, cfg, pool_acc, tp, tp22) = (&a[0], &a[1], &a[2], &a[3], &a[4], &a[5]);
    let (in_mint, user_in, vault_in, out_mint, user_out, vault_out) = (&a[6], &a[7], &a[8], &a[9], &a[10], &a[11]);
    let mut p = pool(pool_acc, id)?;
    let c = config(cfg, id)?;
    require(p.amm_config == key(cfg), E::InvalidState)?;
    signer(user)?;
    require(p.status & STATUS_SWAP_OFF == 0, E::Disabled)?;
    require(now()? >= p.open_time, E::NotOpen)?;
    authority(auth, id, p.auth_bump)?;
    let (i, j) = (i as usize, j as usize);
    let n = p.n();
    require(i < n && j < n, E::IndexOutOfRange)?;
    require(i != j, E::SameToken)?;
    require(amount_in > 0, E::InvalidAmount)?;
    let ak = key(auth);
    require(key(in_mint) == p.mints[i] && key(out_mint) == p.mints[j], E::InvalidVault)?;
    tokens::user_token(user_in, &p.mints[i])?;
    tokens::user_token(user_out, &p.mints[j])?;
    let bal_in = tokens::vault(vault_in, &p.vaults[i], &p.mints[i], &ak)?;
    let bal_out = tokens::vault(vault_out, &p.vaults[j], &p.mints[j], &ak)?;
    require(bal_in >= owed(&p, i)? && bal_out >= owed(&p, j)?, E::ReserveMismatch)?;

    // Pull input first; price on what actually arrived.
    let mtp_in = tokens::program_for(in_mint, tp, tp22)?;
    tokens::transfer(user_in, in_mint, vault_in, user, mtp_in, amount_in, &[])?;
    let received = tokens::amount(vault_in)?.checked_sub(bal_in).ok_or(E::Arithmetic)?;
    require(received > 0, E::InvalidAmount)?;

    let fee_rate = if rebalance { c.trade_fee_rate / u64::from(c.rebalance_fee_divisor) } else { c.trade_fee_rate };
    let fee = math::fee(received, fee_rate)?;
    let protocol_fee = math::fee_share(fee, c.protocol_fee_rate)?;
    let fund_fee = math::fee_share(fee, c.fund_fee_rate)?;
    let net_in = received.checked_sub(fee).ok_or(E::Arithmetic)?;
    require(net_in > 0, E::InvalidAmount)?;

    let xp = math::xps(&p.reserves[..n], &p.decimals[..n], &p.rates[..n])?;
    let dx = math::to_xp(net_in, p.decimals[i], p.rates[i])?;
    let dy_xp = math::swap_out_xp(p.curve(), p.amp, &xp[..n], i, j, dx)?;
    let amount_out = math::from_xp(dy_xp, p.decimals[j], p.rates[j])?;
    require(amount_out > 0, E::InvalidAmount)?;
    require(amount_out >= min_out, E::SlippageExceeded)?;
    require(amount_out < p.reserves[j], E::ZeroLiquidity)?;

    // LP share of the fee stays in reserves; protocol/fund shares are set aside.
    let lp_credit = received.checked_sub(protocol_fee).and_then(|x| x.checked_sub(fund_fee)).ok_or(E::Arithmetic)?;
    let new_in = p.reserves[i].checked_add(lp_credit).ok_or(E::Arithmetic)?;
    let new_out = p.reserves[j] - amount_out;

    if rebalance {
        let before = math::imbalance(&xp[..n])?;
        let mut after_xp = xp;
        after_xp[i] = math::to_xp(new_in, p.decimals[i], p.rates[i])?;
        after_xp[j] = math::to_xp(new_out, p.decimals[j], p.rates[j])?;
        let after = math::imbalance(&after_xp[..n])?;
        require(after < before, E::NotRebalancing)?;
    }

    p.reserves[i] = new_in;
    p.reserves[j] = new_out;
    p.protocol_fees_owed[i] = p.protocol_fees_owed[i].checked_add(protocol_fee).ok_or(E::Arithmetic)?;
    p.fund_fees_owed[i] = p.fund_fees_owed[i].checked_add(fund_fee).ok_or(E::Arithmetic)?;

    let bump = [p.auth_bump];
    let mtp_out = tokens::program_for(out_mint, tp, tp22)?;
    tokens::transfer(vault_out, out_mint, user_out, auth, mtp_out, amount_out, &auth_seeds(&bump))?;
    save(&mut a[3], &p)
}

fn collect_fees(id: &Address, a: &mut [AccountView], kind: u8) -> ProgramResult {
    exact(a, 6)?;
    let (owner, cfg, auth, pool_acc, tp, tp22) = (&a[0], &a[1], &a[2], &a[3], &a[4], &a[5]);
    let c = config(cfg, id)?;
    owner_of(owner, &c)?;
    let mut p = pool(pool_acc, id)?;
    require(p.amm_config == key(cfg), E::InvalidState)?;
    authority(auth, id, p.auth_bump)?;
    let ak = key(auth);
    let l = legs(a, 6, &p, &ak)?;
    let bump = [p.auth_bump];
    let seeds = auth_seeds(&bump);
    for i in 0..p.n() {
        let owed = match kind {
            0 => core::mem::take(&mut p.protocol_fees_owed[i]),
            1 => core::mem::take(&mut p.fund_fees_owed[i]),
            _ => return Err(ProgramError::InvalidInstructionData),
        };
        if owed > 0 {
            let mtp = tokens::program_for(l.mints[i], tp, tp22)?;
            tokens::transfer(l.vaults[i], l.mints[i], l.users[i], auth, mtp, owed, &seeds)?;
        }
    }
    save(&mut a[3], &p)
}
