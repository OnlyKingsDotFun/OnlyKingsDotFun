//! Curve math on rate-normalised 1e18 balances ("xp", Curve terminology).
use crate::{
    error::{AmmError as E, Result},
    state::{Curve, FEE_DENOM, RATE_ONE},
};
use ethnum::U256;

pub const PREC: u32 = 18;
const MAX_ITER: usize = 255;

fn ar(o: Option<u128>) -> Result<u128> {
    o.ok_or(E::Arithmetic.into())
}
fn to_u128(v: U256) -> Result<u128> {
    if v > U256::from(u128::MAX) {
        Err(E::Arithmetic.into())
    } else {
        Ok(v.as_u128())
    }
}
fn scale(dec: u8) -> Result<u128> {
    if u32::from(dec) > PREC {
        return Err(E::UnsupportedToken.into());
    }
    Ok(10u128.pow(PREC - u32::from(dec)))
}

/// amount (token units) -> xp (1e18 units of rate-adjusted value).
pub fn to_xp(amount: u64, dec: u8, rate: u64) -> Result<u128> {
    let v = U256::from(amount) * U256::from(scale(dec)?) * U256::from(rate) / U256::from(RATE_ONE);
    to_u128(v)
}
/// xp -> token units, rounded down.
pub fn from_xp(xp: u128, dec: u8, rate: u64) -> Result<u64> {
    if rate == 0 {
        return Err(E::InvalidAmount.into());
    }
    let v = U256::from(xp) * U256::from(RATE_ONE) / (U256::from(scale(dec)?) * U256::from(rate));
    u64::try_from(to_u128(v)?).map_err(|_| E::Arithmetic.into())
}
pub fn xps(reserves: &[u64], decimals: &[u8], rates: &[u64]) -> Result<[u128; 8]> {
    let mut out = [0u128; 8];
    for i in 0..reserves.len() {
        out[i] = to_xp(reserves[i], decimals[i], rates[i])?;
    }
    Ok(out)
}

/// Fee in input units, rounded up (Raydium style).
pub fn fee(amount: u64, rate: u64) -> Result<u64> {
    if rate == 0 {
        return Ok(0);
    }
    let v = (u128::from(amount) * u128::from(rate) + u128::from(FEE_DENOM) - 1) / u128::from(FEE_DENOM);
    u64::try_from(v).map_err(|_| E::Arithmetic.into())
}
/// Share of a fee, rounded down.
pub fn fee_share(fee: u64, rate: u64) -> Result<u64> {
    u64::try_from(u128::from(fee) * u128::from(rate) / u128::from(FEE_DENOM)).map_err(|_| E::Arithmetic.into())
}

/// Curve StableSwap D. `amp` is A (Ann = A * n).
pub fn get_d(xp: &[u128], amp: u64) -> Result<u128> {
    let n = xp.len() as u128;
    let s: u128 = xp.iter().try_fold(0u128, |a, &x| a.checked_add(x)).ok_or(E::Arithmetic)?;
    if s == 0 {
        return Ok(0);
    }
    let ann = U256::from(amp) * U256::from(n);
    let mut d = U256::from(s);
    let s = U256::from(s);
    let nn = U256::from(n);
    for _ in 0..MAX_ITER {
        let mut d_p = d;
        for &x in xp {
            if x == 0 {
                return Err(E::ZeroLiquidity.into());
            }
            d_p = d_p * d / (U256::from(x) * nn);
        }
        let d_prev = d;
        d = (ann * s + d_p * nn) * d / ((ann - U256::ONE) * d + (nn + U256::ONE) * d_p);
        let diff = if d > d_prev { d - d_prev } else { d_prev - d };
        if diff <= U256::ONE {
            return to_u128(d);
        }
    }
    Err(E::ConvergenceFailed.into())
}

/// New balance of coin j after coin i's balance becomes `x`, holding D.
pub fn get_y(i: usize, j: usize, x: u128, xp: &[u128], amp: u64) -> Result<u128> {
    let n = xp.len();
    let d = U256::from(get_d(xp, amp)?);
    let nn = U256::from(n as u128);
    let ann = U256::from(amp) * nn;
    let mut c = d;
    let mut s = U256::ZERO;
    for k in 0..n {
        let xk = if k == i {
            U256::from(x)
        } else if k != j {
            U256::from(xp[k])
        } else {
            continue;
        };
        if xk == U256::ZERO {
            return Err(E::ZeroLiquidity.into());
        }
        s += xk;
        c = c * d / (xk * nn);
    }
    c = c * d / (ann * nn);
    let b = s + d / ann;
    let mut y = d;
    for _ in 0..MAX_ITER {
        let y_prev = y;
        y = (y * y + c) / (U256::from(2u8) * y + b - d);
        let diff = if y > y_prev { y - y_prev } else { y_prev - y };
        if diff <= U256::ONE {
            return to_u128(y);
        }
    }
    Err(E::ConvergenceFailed.into())
}

/// Output xp for `dx` xp of coin i into coin j (fee already removed from dx).
pub fn swap_out_xp(curve: Curve, amp: u64, xp: &[u128], i: usize, j: usize, dx: u128) -> Result<u128> {
    if xp[i] == 0 || xp[j] == 0 {
        return Err(E::ZeroLiquidity.into());
    }
    match curve {
        Curve::ConstantProduct => {
            // Geometric-mean invariant with equal weights: pairwise trade is exactly x*y=k.
            let x = U256::from(xp[i]);
            let y = U256::from(xp[j]);
            let dx = U256::from(dx);
            to_u128(y * dx / (x + dx))
        }
        Curve::Stable => {
            let x_new = ar(xp[i].checked_add(dx))?;
            let y_new = get_y(i, j, x_new, xp, amp)?;
            // Curve subtracts 1 for rounding safety.
            Ok(xp[j].saturating_sub(y_new).saturating_sub(1))
        }
    }
}

/// Sum of absolute deviations from the mean rate-adjusted value. Zero == perfectly balanced.
pub fn imbalance(xp: &[u128]) -> Result<u128> {
    let n = xp.len() as u128;
    let s: u128 = xp.iter().try_fold(0u128, |a, &x| a.checked_add(x)).ok_or(E::Arithmetic)?;
    let mean = s / n;
    let mut acc = 0u128;
    for &x in xp {
        acc = ar(acc.checked_add(if x > mean { x - mean } else { mean - x }))?;
    }
    Ok(acc)
}

/// ceil(a * b / c)
pub fn mul_div_ceil(a: u64, b: u64, c: u64) -> Result<u64> {
    if c == 0 {
        return Err(E::Arithmetic.into());
    }
    let v = (u128::from(a) * u128::from(b) + u128::from(c) - 1) / u128::from(c);
    u64::try_from(v).map_err(|_| E::Arithmetic.into())
}
pub fn mul_div_floor(a: u64, b: u64, c: u64) -> Result<u64> {
    if c == 0 {
        return Err(E::Arithmetic.into());
    }
    u64::try_from(u128::from(a) * u128::from(b) / u128::from(c)).map_err(|_| E::Arithmetic.into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stable_d_and_y_roundtrip() {
        let xp = [1_000_000u128 * 10u128.pow(18), 1_000_000 * 10u128.pow(18), 1_000_000 * 10u128.pow(18)];
        let d = get_d(&xp, 100).unwrap();
        assert!((d as i128 - 3_000_000 * 10i128.pow(18)).abs() < 10);
        let dx = 10_000 * 10u128.pow(18);
        let out = swap_out_xp(Curve::Stable, 100, &xp, 0, 1, dx).unwrap();
        // near-peg: out slightly less than in
        assert!(out < dx && out > dx * 999 / 1000);
        let mut after = xp;
        after[0] += dx;
        after[1] -= out;
        let d2 = get_d(&after, 100).unwrap();
        assert!(d2 >= d);
    }
    #[test]
    fn cp_pairwise() {
        let xp = [100u128 * 10u128.pow(18), 200 * 10u128.pow(18), 50 * 10u128.pow(18)];
        let out = swap_out_xp(Curve::ConstantProduct, 0, &xp, 0, 1, 100 * 10u128.pow(18)).unwrap();
        assert_eq!(out, 100 * 10u128.pow(18));
    }
    #[test]
    fn imbalance_decreases_toward_mean() {
        let a = [100u128, 100, 100];
        let b = [130u128, 70, 100];
        assert_eq!(imbalance(&a).unwrap(), 0);
        assert!(imbalance(&b).unwrap() > 0);
    }
    #[test]
    fn xp_roundtrip() {
        let xp = to_xp(1_500_000, 6, RATE_ONE).unwrap();
        assert_eq!(xp, 1_500_000 * 10u128.pow(12));
        assert_eq!(from_xp(xp, 6, RATE_ONE).unwrap(), 1_500_000);
        let lst = to_xp(1_000_000_000, 9, 1_150_000_000).unwrap();
        assert_eq!(lst, 1_150_000_000 * 10u128.pow(9));
    }
}
