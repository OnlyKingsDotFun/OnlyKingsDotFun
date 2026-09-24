use crate::{
    error::{AmmError as E, Result},
    state::*,
};
use pinocchio::{
    cpi::{Seed, Signer},
    error::ProgramError,
    sysvars::{clock::Clock, rent::Rent, Sysvar},
    AccountView, Address, ProgramResult,
};
use pinocchio_system::instructions::{Allocate, Assign, CreateAccount, Transfer as SolTransfer};

pub fn key(a: &AccountView) -> Key {
    a.address().to_bytes()
}
pub fn address(k: &Key) -> Address {
    Address::new_from_array(*k)
}
pub fn require(ok: bool, e: E) -> ProgramResult {
    if ok {
        Ok(())
    } else {
        Err(e.into())
    }
}
pub fn signer(a: &AccountView) -> ProgramResult {
    require(a.is_signer(), E::Unauthorized)
}
pub fn writable(a: &AccountView) -> ProgramResult {
    require(a.is_writable(), E::InvalidState)
}
pub fn program(a: &AccountView, id: &Address) -> ProgramResult {
    require(a.address() == id && a.executable(), E::InvalidState)
}
pub fn exact(a: &[AccountView], n: usize) -> ProgramResult {
    if a.len() < n {
        Err(ProgramError::NotEnoughAccountKeys)
    } else {
        Ok(())
    }
}
pub fn now() -> Result<u64> {
    u64::try_from(Clock::get()?.unix_timestamp).map_err(|_| E::InvalidState.into())
}
pub fn load<T: State>(a: &AccountView, id: &Address) -> Result<T> {
    require(a.owned_by(id) && a.data_len() == T::SPACE, E::InvalidState)?;
    let bytes = a.try_borrow()?;
    require(bytes[..8] == T::TAG && bytes[8] == VERSION, E::InvalidState)?;
    T::try_from_slice(&bytes[8..]).map_err(|_| ProgramError::InvalidAccountData)
}
pub fn save<T: State>(a: &mut AccountView, state: &T) -> ProgramResult {
    writable(a)?;
    let mut bytes = a.try_borrow_mut()?;
    require(bytes.len() == T::SPACE, E::InvalidState)?;
    bytes[..8].copy_from_slice(&T::TAG);
    let mut cur = &mut bytes[8..];
    state.serialize(&mut cur).map_err(|_| ProgramError::InvalidAccountData)
}
pub fn pda(a: &AccountView, id: &Address, seeds: &[&[u8]]) -> Result<u8> {
    let (expected, bump) = Address::find_program_address(seeds, id);
    require(a.address() == &expected, E::InvalidPda)?;
    Ok(bump)
}
pub fn config(a: &AccountView, id: &Address) -> Result<AmmConfig> {
    let c: AmmConfig = load(a, id)?;
    require(
        pda(a, id, &[CONFIG_SEED, &c.owner, &c.index.to_le_bytes()])? == c.bump,
        E::InvalidPda,
    )?;
    Ok(c)
}
pub fn pool(a: &AccountView, id: &Address) -> Result<PoolState> {
    let p: PoolState = load(a, id)?;
    require(
        pda(a, id, &[POOL_SEED, &p.amm_config, &p.creator, &p.nonce.to_le_bytes()])? == p.bump,
        E::InvalidPda,
    )?;
    Ok(p)
}
pub fn authority(a: &AccountView, id: &Address, bump: u8) -> ProgramResult {
    let expected = Address::create_program_address(&[AUTH_SEED, &[bump]], id)?;
    require(a.address() == &expected, E::InvalidPda)
}

/// Creates a PDA, tolerating pre-funded lamports (prevents third-party init DoS).
pub fn create(payer: &AccountView, target: &AccountView, owner: &Address, space: usize, seeds: &[Seed]) -> ProgramResult {
    signer(payer)?;
    writable(payer)?;
    writable(target)?;
    require(target.owned_by(&pinocchio_system::ID) && target.data_len() == 0, E::AlreadyInitialized)?;
    let signers = [Signer::from(seeds)];
    let rent = Rent::get()?.try_minimum_balance(space)?;
    if target.lamports() == 0 {
        CreateAccount { from: payer, to: target, lamports: rent, space: space as u64, owner }.invoke_signed(&signers)?;
    } else {
        if target.lamports() < rent {
            SolTransfer { from: payer, to: target, lamports: rent - target.lamports() }.invoke()?;
        }
        Allocate { account: target, space: space as u64 }.invoke_signed(&signers)?;
        Assign { account: target, owner }.invoke_signed(&signers)?;
    }
    Ok(())
}
