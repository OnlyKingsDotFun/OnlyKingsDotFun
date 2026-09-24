//! Raw SPL Token / Token-2022 account parsing and CPI wrappers (both programs share layouts).
use crate::{
    accounts::{create, program, require},
    error::{AmmError as E, Result},
    state::Key,
};
use pinocchio::{
    cpi::{Seed, Signer},
    AccountView, Address, ProgramResult,
};
use pinocchio_token::instructions::{Burn, InitializeAccount3, InitializeMint2, MintTo, TransferChecked};

pub const ID22: Address = Address::from_str_const("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
pub const MINT_LEN: usize = 82;
pub const ACCOUNT_LEN: usize = 165;

pub fn supported(id: &Address) -> ProgramResult {
    require(id == &pinocchio_token::ID || id == &ID22, E::UnsupportedToken)
}
/// Picks the token program account matching the mint's owner.
pub fn program_for<'a>(m: &AccountView, tp: &'a AccountView, tp22: &'a AccountView) -> Result<&'a AccountView> {
    program(tp, &pinocchio_token::ID)?;
    program(tp22, &ID22)?;
    if m.owned_by(&pinocchio_token::ID) {
        Ok(tp)
    } else if m.owned_by(&ID22) {
        Ok(tp22)
    } else {
        Err(E::UnsupportedToken.into())
    }
}
pub struct MintInfo {
    pub decimals: u8,
    pub supply: u64,
}
pub fn mint(a: &AccountView) -> Result<MintInfo> {
    supported(a.owner())?;
    let d = a.try_borrow()?;
    require(d.len() >= MINT_LEN && d[45] == 1, E::UnsupportedToken)?;
    // Token-2022 mint extensions follow the base at 82..; account type byte at 165 must be Mint (1).
    require(d.len() == MINT_LEN || (d.len() > ACCOUNT_LEN && d[ACCOUNT_LEN] == 1), E::UnsupportedToken)?;
    Ok(MintInfo { decimals: d[44], supply: u64::from_le_bytes(d[36..44].try_into().unwrap()) })
}
pub struct TokenInfo {
    pub mint: Key,
    pub owner: Key,
    pub amount: u64,
}
pub fn token(a: &AccountView) -> Result<TokenInfo> {
    supported(a.owner())?;
    let d = a.try_borrow()?;
    require(d.len() >= ACCOUNT_LEN && d[108] == 1, E::InvalidVault)?;
    Ok(TokenInfo {
        mint: d[0..32].try_into().unwrap(),
        owner: d[32..64].try_into().unwrap(),
        amount: u64::from_le_bytes(d[64..72].try_into().unwrap()),
    })
}
pub fn amount(a: &AccountView) -> Result<u64> {
    Ok(token(a)?.amount)
}
/// Verifies `a` is the pool vault for `mint` owned by `authority`.
pub fn vault(a: &AccountView, expected: &Key, mint: &Key, authority: &Key) -> Result<u64> {
    require(a.address().to_bytes() == *expected, E::InvalidVault)?;
    let t = token(a)?;
    require(t.mint == *mint && t.owner == *authority, E::InvalidVault)?;
    Ok(t.amount)
}
pub fn user_token(a: &AccountView, mint: &Key) -> Result<u64> {
    let t = token(a)?;
    require(t.mint == *mint, E::InvalidVault)?;
    Ok(t.amount)
}
pub fn create_vault(payer: &AccountView, vault: &AccountView, m: &AccountView, tp: &AccountView, authority: &Address, seeds: &[Seed]) -> ProgramResult {
    let d = m.try_borrow()?;
    // Base account + ImmutableOwner-free layout; Token-2022 mints with extensions need extra space.
    let size = if d.len() == MINT_LEN { ACCOUNT_LEN } else { ACCOUNT_LEN + 1 + extra_account_space(&d) };
    drop(d);
    create(payer, vault, m.owner(), size, seeds)?;
    InitializeAccount3::new(vault, m, authority).invoke_with_program(tp.address())
}
/// Conservative extension budget for Token-2022 vaults: TransferFeeAmount (12) + generous slack.
fn extra_account_space(_mint_data: &[u8]) -> usize {
    64
}
pub fn create_mint(payer: &AccountView, mint_acc: &AccountView, tp: &AccountView, decimals: u8, authority: &Address, seeds: &[Seed]) -> ProgramResult {
    program(tp, &pinocchio_token::ID)?;
    create(payer, mint_acc, &pinocchio_token::ID, MINT_LEN, seeds)?;
    InitializeMint2::new(mint_acc, decimals, authority, None).invoke_with_program(tp.address())
}
pub fn transfer(from: &AccountView, m: &AccountView, to: &AccountView, authority: &AccountView, tp: &AccountView, amount: u64, seeds: &[Seed]) -> ProgramResult {
    require(from.address() != to.address(), E::InvalidVault)?;
    require(tp.address() == m.owner(), E::UnsupportedToken)?;
    let decimals = mint(m)?.decimals;
    let ix = TransferChecked::new(from, m, to, authority, amount, decimals);
    if seeds.is_empty() {
        ix.invoke_with_program(tp.address())
    } else {
        ix.invoke_signed_with_program(&[Signer::from(seeds)], tp.address())
    }
}
pub fn mint_to(m: &AccountView, to: &AccountView, authority: &AccountView, tp: &AccountView, amount: u64, seeds: &[Seed]) -> ProgramResult {
    MintTo::new(m, to, authority, amount).invoke_signed_with_program(&[Signer::from(seeds)], tp.address())
}
pub fn burn(from: &AccountView, m: &AccountView, owner: &AccountView, tp: &AccountView, amount: u64) -> ProgramResult {
    Burn::new(from, m, owner, amount).invoke_with_program(tp.address())
}
