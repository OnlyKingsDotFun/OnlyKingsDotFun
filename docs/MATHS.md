# The maths, fees, and money flows

**OnlyKings.fun is not open for transactions yet.** This is the specification of the current source, with worked examples. Pool settings and addresses will be published at launch. Examples are not live quotes or a promised fee tier.

[Stablecoin research →](/docs/stablecoins/) · [Source on GitHub](https://github.com/OnlyKingsDotFun/OnlyKingsDotFun) · [Telegram](https://t.me/onlykingsdotfun)

## 1. What a pot means

A collection records which token mints belong together and their reference rates. A collection pool gives those members vaults and an intra-pot swap path. The ordinary pair still has its own CPMM or CLMM swap path against its quote token.

There are three distinct calculations:

| Path | Price calculation | Trading fee |
| --- | --- | --- |
| Ordinary CPMM pair | Constant product | Configured base fee; creator fee if enabled |
| Ordinary CLMM pair | Active liquidity and ticks | Configured base fee |
| Intra-pot swap, in either fork | StableSwap across member vaults | Base fee divided by the collection divisor, minimum 1 ppm |
| Rebalancing a normal pair | Its existing CPMM or CLMM curve, with a closeness check | Discounted base fee; CPMM creator fee rules still apply |

The intra-pot discount applies to that path. The strict improvement test belongs to the separate rebalance instructions. These are different instructions, not one universal fee gate.

The current vault set supports **up to eight members**, with equal mint decimals. Member zero uses the pair's base vault. The pair's quote vault is not automatically another StableSwap member. The interface's three planned pots describe the launch experience; their final vault composition and routing still need configuration.

## 2. Units and reference rates

All contract amounts are integers in the token's smallest units. For a mint with `d` decimals, one token is `10^d` units. Rate scale `R = 1,000,000,000`; a stored rate of `R` means a 1.0 reference value.

```text
whole token amount = raw amount / 10^decimals
reference value = whole token amount × rate / R
intra-pot normalized reserve x[i] = usable raw reserve[i] × rate[i]
```

The intra-pot implementation multiplies raw amounts by rates directly. It requires the same decimals across its members; the common decimal/rate factor cancels. It does not silently normalize differently-decimalled mints.

For a layout-compatible SPL stake pool, the current rate reader uses:

```text
rate = floor(total_lamports × R / pool_token_supply)
```

This represents SOL per pool token when pool-token units are compatible with lamport units. The source validates the proof owner and pool mint; a different staking layout or denomination requires its own adapter. A zero supply returns the default rate. Rates can be refreshed permissionlessly from that proof; the collection authority can also set member rates.

**A 1:1 reference is not a guarantee of receiving exactly one token for another.** At equal normalized reserves, the marginal StableSwap price is at the reference rate. A finite trade has curve impact, integer rounding, and fees. Yield-accruing tokens need their changing exchange rate; volatile meme tokens do not become equal-value dollars by joining a pot.

## 3. Every fee in an intra-pot swap

Let `M = 1,000,000` (ppm), `f` be the configured base trade-fee rate, and `v` the collection divisor.

```text
effective fee e = max(floor(f / v), 1)
actual input a = gross input − input token transfer fee
trade fee F = ceil(a × e / M)
curve input q = a − F
protocol share = floor(F × protocol_fee_rate / M)
fund share = floor(F × fund_fee_rate / M)
remaining trading fee = F − protocol share − fund share
```

Protocol and fund shares divide the trading fee; they are not additional percentages of the whole trade. The current intra-swap instructions do not add the ordinary CPMM creator fee. The unallocated trading fee remains in the vault. Its treatment should not be confused with a fully implemented multi-asset LP-share claim mechanism.

| Example configuration | Fee in ppm | Fee as a percentage | Trading fee on 1,000 tokens before curve impact |
| --- | ---: | ---: | ---: |
| Base rate | 2,500 | 0.25% | 2.5 tokens |
| Divisor 100 | 25 | 0.0025% | 0.025 tokens |
| Divisor 1,000 | 2 | 0.0002% | 0.002 tokens |
| Minimum rate | 1 | 0.0001% | 0.001 tokens |

Integer division means `2500 / 1000` becomes **2 ppm**, not 2.5 ppm. Rounding fees upward means tiny transactions can have a higher effective percentage than the nominal rate.

For example, with 1,000 USDC, 25 ppm, no token transfer fee, and illustrative protocol/fund shares of 120,000/40,000 ppm:

```text
gross input             1,000.000000 USDC
trade fee                   0.025000 USDC
curve input               999.975000 USDC
protocol portion            0.003000 USDC
fund portion                0.001000 USDC
remaining trading fee       0.021000 USDC
```

The received token amount still comes from the curve below. It is not necessarily 999.975000 of the other token.

## 4. StableSwap: the full integer algorithm

Let `n` be the number of member vaults, `A` the stored amplification, `Ann = A × n`, `S = sum(x[i])`. The code accepts `A` from 1 to 1,000,000. The symbol convention matters: this source uses `Ann = A × n`; do not substitute another implementation's differently scaled amplification.

Starting with `D = S`, compute the invariant by iterating:

```text
DP = D
for every reserve x[k]:
    DP = floor(DP × D / (n × x[k]))

Dnext = floor(((Ann × S + n × DP) × D)
              / ((Ann − 1) × D + (n + 1) × DP))
```

Stop when `abs(Dnext − D) <= 1`; otherwise continue, up to 255 iterations. An empty total returns zero. A zero constituent reserve or failure to converge prevents a usable quote.

For an input into member `i` and output from `j`:

```text
new x[i] = x[i] + curve_input × rate[i]
c = D
Sother = 0
for k != j:
    z = new x[i] if k == i, otherwise x[k]
    Sother += z
    c = floor(c × D / (n × z))
c = floor(c × D / (Ann × n))
b = Sother + floor(D / Ann)
y = D
repeat:
    ynext = floor((y × y + c) / (2 × y + b − D))
    stop if abs(ynext − y) <= 1, else y = ynext

normalized output = max(x[j] − ynext − 1, 0)
gross output = floor(normalized output / rate[j])
received output = gross output − output token transfer fee
```

The output iteration also has a 255-step limit. The one-unit subtraction and final floor favor the pool. The handler rejects zero output, output reaching the usable output reserve, and output below the caller's minimum.

A larger amplification makes the curve flatter around balance. It does not ensure a peg or certify that a member token can be redeemed for its reference value.

## 5. Ordinary CPMM swaps and creator fees

For usable input/output reserves `X`, `Y`, and input `q` after applicable fees:

```text
k = X × Y
output before output-side fees = floor(q × Y / (X + q))
```

Exact output reverses this with the source's checked ceiling division:

```text
curve input required = ceil(X × desired_curve_output / (Y − desired_curve_output))
pre-fee input = ceil(post-fee input × M / (M − fee_rate))
```

When the CPMM creator fee is charged on input, with creator rate `c`:

```text
total fee = ceil(actual_input × (f + c) / M)
creator fee = floor(total fee × c / (f + c))
trade fee = total fee − creator fee
curve input = actual_input − total fee
```

When the creator fee is charged on output, the trade fee is first removed from input; after curve pricing, `ceil(curve_output × c / M)` is removed from output. Token transfer fees are applied at the actual transfer boundaries as well. The pool/config selects the applicable creator-fee behavior.

Exact-output swaps must also gross up the desired receipt for any output transfer fee. They then reverse the curve and gross up input fees, respecting the user's maximum input. Intra-pot swaps currently expose exact input, not a separate exact-output instruction.

## 6. Rebalance discounts

For CPMM, the handler compares rate-adjusted values on a common 18-decimal scale:

```text
V(raw, decimals, rate) = floor(raw × 10^(18 − decimals) × rate / R)
imbalance = abs(V(input reserve) − V(output reserve))
accept only if imbalance_after < imbalance_before
```

The check uses the curve-calculated reserves after fee removal. Equal imbalance fails. A trade can cross the target if its final distance is smaller; the code does not categorically prohibit every overshoot.

For CLMM, with token rates `r0`, `r1` and decimals `d0`, `d1`:

```text
target raw price token1/token0 = (r0 / r1) × 10^(d1 − d0)
target sqrt price X64 ≈ floor(sqrt(target raw price) × 2^64)
accept only the direction toward target
and abs(sqrt_after − target) < abs(sqrt_before − target)
```

The exact fixed-point implementation and rounding are linked in the source map below.

## 7. CLMM price, liquidity, and LP fees

CLMM stores square-root price in Q64.64. If `s = sqrt_price_x64 / 2^64`, then the raw price is `P = s²`; a tick corresponds approximately to `P = 1.0001^tick`.

For liquidity `L`, lower/upper square-root prices `sa`, `sb`, and price inside that interval:

```text
token0 amount = L × (1/s − 1/sb)
token1 amount = L × (s − sa)
```

Below the range, the position is entirely token0; above it, entirely token1. A swap traverses initialized ticks and updates active liquidity. Each step charges its configured trade fee. Input requirements round up; outputs round down. Exact-output math and fee growth use integer fixed-point arithmetic rather than these real-number display formulas.

Ordinary CLMM LP fees accrue through fee-growth accounting. The intra-pot path records protocol/fund portions and leaves the remaining fee in the member vault; it does not itself update the ordinary per-tick LP fee-growth calculation. The docs do not imply those are already the same payout system.

## 8. Deposits, withdrawals, and pot shares

For an ordinary CPMM pair with LP supply `T`, usable reserves `X,Y`, and an LP amount `L`:

```text
deposit token0 ≈ ceil(L × X / T)
deposit token1 ≈ ceil(L × Y / T)
withdraw token0 = floor(L × X / T)
withdraw token1 = floor(L × Y / T)
```

The deposit helper preserves a zero result for amounts too small to form a valid deposit, instead of forcing it to one unit. Token-2022 deposits gross up transfer fees; withdrawals deduct transfer fees from receipts. Initial CPMM liquidity is `floor(sqrt(X × Y))`; 100 raw LP units are withheld from the initial user's mint. A configured pool-creation charge is separate from LP liquidity and rent.

These are the existing pair LP formulas. **The generalized single-token, multi-member “pot shares” deposit/withdraw experience is still to be implemented.** The current collection module creates member vaults and swaps between them; ordinary pair LP shares must not be presented as a complete proportional claim on every extra member vault. Preview deposit and withdrawal forms therefore remain disabled.

## 9. Token fees, slippage, and Solana costs

A Token-2022 transfer-fee extension can impose a mint-defined transfer charge in addition to an AMM fee. Its current epoch's basis-point rate and maximum fee control the charge. In the usual fee case:

```text
transfer fee = min(maximum_fee, ceil(raw_transfer × basis_points / 10,000))
```

The implementation calls the token program's fee helpers, including inverse-fee logic, rather than assuming every Token-2022 mint charges a fee. Mint/burn charges of a separate staking protocol are also separate from the AMM. The earlier creator-LST 6.9% proposal is not a universal OnlyKings swap fee.

A frontend can derive a minimum receipt from a chosen slippage tolerance `s` in basis points:

```text
minimum received = floor(quoted net output × (10,000 − s) / 10,000)
```

The program enforces the supplied minimum after the output transfer fee. Slippage tolerance is a limit, not another fee. Price impact is also distinct from a fee. Solana network fees, optional priority fees, account rent, and setup charges are paid separately. The launch budget does not include LP seed liquidity.

## 10. Gauges and vote power

The current gauge program supports CPMM-owned collections. CLMM gauge integration is unfinished. A lock contains amount `a`, expiry `end`, and a configured maximum lock duration `Tmax`:

```text
power(now) = floor(a × max(end − now, 0) / Tmax)
epoch(now) = floor((now − epoch_start) / epoch_seconds)
```

A vote spends some current power in the current epoch. Already-used power in that epoch counts toward the available budget. A vote record keeps its cast weight; it is not continuously recalculated as time passes.

For gauge fees `Fepoch`, total cast weight `W`, and a voter's weight `w`:

```text
claim = floor(Fepoch × w / W)
```

Claims open after the epoch ends and pay in the collection's quote token. An ended epoch with no votes can roll its fee allocation into the current epoch. Integer claim dust remains in the vault; the current unvoted sweep applies only to epochs with zero votes. There is no fixed APY or launch emissions schedule in this code.

## 11. Treasury recycling

The current recycler takes at most a configured cap from a treasury quote-token balance. If `p` is the configured protocol-owned-liquidity share in basis points:

```text
take = min(treasury balance, recycle cap)
gauge share = floor(take × (10,000 − p) / 10,000)
POL budget = take − gauge share
quote swapped into protocol token = floor(POL budget / 2)
```

The remaining quote and acquired protocol tokens are deposited into a configured CPMM pair; LP tokens stay with the treasury. A pool-derived output floor and per-call cap bound the operation. A pool-derived floor is not an independent market oracle.

This flow is separate from the browser creator-fee settlement proposal. The current gauge recycler does not implement a Wizards bridge payout or the proposed staccoverflow LST buy-and-burn split. Those are not described here as live fee destinations.

## 12. Launch budget and published settings

Current measured rent for the three compiled binaries:

| Program | Rent in SOL |
| --- | ---: |
| Collection CPMM | 4.79975164 |
| Collection CLMM | 9.17359100 |
| Current gauge binary | 3.08580028 |
| Total | **17.05914292** |

OnlyKingsDotFun's pump.fun creator fees fund the launch. The displayed target rounds to 17.06 SOL, plus transaction/setup costs and separately funded liquidity. Binary changes can change rent. Optional launch/graduation and bonding-curve programs are outside this three-program budget.

Before transactions open, the site will publish deployed addresses, exact admitted mints, amplification, rates/adapters, fees/divisor/splits, administrative controls, gauge parameters, and the seeded pools. None of the preview's numerical examples constitutes those live settings.

## 13. Source map

The formulas above follow the repository's current source. These links expose the integer implementations, configuration validation, and tests; `main` can evolve.

- [CPMM StableSwap integer solver](https://github.com/OnlyKingsDotFun/OnlyKingsDotFun/blob/main/upstream/raydium-cp-swap/programs/cp-swap/src/curve/stable.rs)
- [CPMM intra-pot transfers and fee accounting](https://github.com/OnlyKingsDotFun/OnlyKingsDotFun/blob/main/upstream/raydium-cp-swap/programs/cp-swap/src/instructions/collection_pool/intra_swap.rs)
- [CLMM intra-pot transfers and fee accounting](https://github.com/OnlyKingsDotFun/OnlyKingsDotFun/blob/main/upstream/raydium-clmm/programs/amm/src/instructions/collection_pool/intra_swap.rs)
- [Fee rounding and creator-fee helpers](https://github.com/OnlyKingsDotFun/OnlyKingsDotFun/blob/main/upstream/raydium-cp-swap/programs/cp-swap/src/curve/fees.rs)
- [CPMM exact-input/output calculator](https://github.com/OnlyKingsDotFun/OnlyKingsDotFun/blob/main/upstream/raydium-cp-swap/programs/cp-swap/src/curve/calculator.rs)
- [CPMM constant-product and LP conversions](https://github.com/OnlyKingsDotFun/OnlyKingsDotFun/blob/main/upstream/raydium-cp-swap/programs/cp-swap/src/curve/constant_product.rs)
- [CPMM rebalance check](https://github.com/OnlyKingsDotFun/OnlyKingsDotFun/blob/main/upstream/raydium-cp-swap/programs/cp-swap/src/instructions/swap_base_input.rs)
- [CLMM rebalance check](https://github.com/OnlyKingsDotFun/OnlyKingsDotFun/blob/main/upstream/raydium-clmm/programs/amm/src/instructions/rebalance_swap_v2.rs)
- [CLMM target-price and collection types](https://github.com/OnlyKingsDotFun/OnlyKingsDotFun/blob/main/upstream/raydium-clmm/programs/amm/src/states/collection.rs)
- [CLMM swap-step maths](https://github.com/OnlyKingsDotFun/OnlyKingsDotFun/blob/main/upstream/raydium-clmm/programs/amm/src/libraries/swap_math.rs)
- [Collection rules and stake-pool rate reader](https://github.com/OnlyKingsDotFun/OnlyKingsDotFun/blob/main/upstream/raydium-cp-swap/programs/cp-swap/src/instructions/collection/rules.rs)
- [Member vault limits](https://github.com/OnlyKingsDotFun/OnlyKingsDotFun/blob/main/upstream/raydium-cp-swap/programs/cp-swap/src/states/pool_members.rs)
- [Gauge power and state](https://github.com/OnlyKingsDotFun/OnlyKingsDotFun/blob/main/programs/isotope-ve/src/state.rs)
- [Gauge votes, claims, and sweeps](https://github.com/OnlyKingsDotFun/OnlyKingsDotFun/blob/main/programs/isotope-ve/src/instructions/vote.rs)
- [Treasury recycling](https://github.com/OnlyKingsDotFun/OnlyKingsDotFun/blob/main/programs/isotope-ve/src/instructions/recycle.rs)
- [Measured deployment costs](https://github.com/OnlyKingsDotFun/OnlyKingsDotFun/blob/main/docs/DEPLOYMENT-COSTS.md)

The small interface draws on the [MIT-licensed July 2020 Yearn frontend](https://github.com/yearn/iearn-finance/tree/47abaa50a019ad747105fdf835ed18462abb3236). [License](/licenses/yearn-ui-MIT.txt). OnlyKings is independent of Yearn, Curve, Raydium, and the token issuers.
