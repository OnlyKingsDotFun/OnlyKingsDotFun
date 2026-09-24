import BN from "bn.js";

/** Curve StableSwap over rate-normalised balances. Mirrors `curve/stable.rs` in the programs. */
const MAX_ITER = 255;
const ONE = new BN(1);

export function stableGetD(xp: BN[], amp: BN): BN {
  const n = new BN(xp.length);
  const s = xp.reduce((a, x) => a.add(x), new BN(0));
  if (s.isZero()) return new BN(0);
  const ann = amp.mul(n);
  let d = s.clone();
  for (let k = 0; k < MAX_ITER; k++) {
    let dP = d.clone();
    for (const x of xp) {
      if (x.isZero()) throw new Error("zero balance");
      dP = dP.mul(d).div(x.mul(n));
    }
    const dPrev = d;
    d = ann.mul(s).add(dP.mul(n)).mul(d).div(ann.sub(ONE).mul(d).add(n.add(ONE).mul(dP)));
    if (d.sub(dPrev).abs().lte(ONE)) return d;
  }
  throw new Error("stable curve did not converge");
}

export function stableGetY(i: number, j: number, x: BN, xp: BN[], amp: BN): BN {
  const n = new BN(xp.length);
  const d = stableGetD(xp, amp);
  const ann = amp.mul(n);
  let c = d.clone();
  let s = new BN(0);
  for (let k = 0; k < xp.length; k++) {
    let xk: BN;
    if (k === i) xk = x;
    else if (k !== j) xk = xp[k];
    else continue;
    if (xk.isZero()) throw new Error("zero balance");
    s = s.add(xk);
    c = c.mul(d).div(xk.mul(n));
  }
  c = c.mul(d).div(ann.mul(n));
  const b = s.add(d.div(ann));
  let y = d.clone();
  for (let k = 0; k < MAX_ITER; k++) {
    const yPrev = y;
    y = y.mul(y).add(c).div(y.muln(2).add(b).sub(d));
    if (y.sub(yPrev).abs().lte(ONE)) return y;
  }
  throw new Error("stable curve did not converge");
}

export interface IntraSwapQuote {
  amountOut: BN;
  tradeFee: BN;
  /** effective price in output per input, 1e9 scaled */
  priceX9: BN;
}

/**
 * Quote an intra swap exactly as the program computes it.
 * `reserves[k]` = vault amount minus fees owed, `rates[k]` in 1e9, `tradeFeeRate` ppm, `divisor` from the collection.
 */
export function quoteIntraSwap(
  reserves: BN[],
  rates: BN[],
  amp: BN,
  fromIndex: number,
  toIndex: number,
  amountIn: BN,
  tradeFeeRate: BN,
  divisor: number,
): IntraSwapQuote {
  const FEE_DENOM = new BN(1_000_000);
  const feeRate = BN.max(tradeFeeRate.divn(divisor), ONE);
  const tradeFee = amountIn.mul(feeRate).add(FEE_DENOM).sub(ONE).div(FEE_DENOM);
  const netIn = amountIn.sub(tradeFee);
  const xp = reserves.map((r, k) => r.mul(rates[k]));
  const dx = netIn.mul(rates[fromIndex]);
  const yNew = stableGetY(fromIndex, toIndex, xp[fromIndex].add(dx), xp, amp);
  const dy = xp[toIndex].sub(yNew).sub(ONE);
  const amountOut = dy.div(rates[toIndex]);
  const priceX9 = amountIn.isZero() ? new BN(0) : amountOut.mul(new BN(1_000_000_000)).div(amountIn);
  return { amountOut, tradeFee, priceX9 };
}
