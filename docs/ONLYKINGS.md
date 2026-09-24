# OnlyKings.fun, explained to someone who already knows what an AMM is

> Historical design overview. For current implemented behavior, limits, rounding,
> fee accounting, and unfinished integration, use [Maths & fees](MATHS.md).
> Production swaps and deposits are not live. Collection pools currently allow
> at most eight members with equal decimals; finite swaps are curve-priced and
> are not guaranteed to execute at a fixed 1:1 rate.

**TL;DR.** A stable is a stable, an LST is an LST, a meme is a meme, more or less. Every AMM today still prices each pair as an island. OnlyKings.fun adds one primitive to Raydium's CPMM and CLMM: a **collection**, a rule-defined set of tokens that are "the same thing, more or less", and a **multipool** where any two members of a collection trade directly against each other inside one pool at a fraction of the normal fee. Trades that repair a pool are cheap; trades that push it off-balance pay full price. That is the whole trick, and the whole invite to arbitrage.

---

## 1. The problem

Take USDC, USDT, PYUSD. Or jitoSOL, mSOL, bSOL. Or forty pump.fun memes that graduated this week. The market treats each group as a set: their prices are tied by arbitrage, not by anyone's opinion. But on a normal AMM each *pair* is its own pool with its own liquidity and its own fee, so:

- capital is fragmented across N² pairs,
- rotating within the set (jitoSOL to mSOL) costs a full-fee hop, usually two,
- the person who keeps the set consistent, the arb, pays the same fee as a retail buyer.

Curve solved half of this in 2020: put near-substitutes in one pool with a curve that's flat near parity. Solidly (Andre Cronje) solved the other half: route fees to whoever does the work of keeping the system honest, and let everyone else build on top permissionlessly. OnlyKings.fun applies both to Raydium's existing pools without replacing them.

## 2. Collections

Three on-chain objects, added to each AMM program.

**Ruleset** (admin-defined). *What counts as a member.* A rule reads only the mint and a proof account the registrant supplies, so membership is a pure function of chain state. Rules shipped:

| kind | proof | admits |
|---|---|---|
| `PumpFunLaunch` | the mint's pump.fun bonding curve | standard, non-mayhem pump launches (curve owned by pump, PDA matches mint) |
| `Lst` | the SPL stake pool whose `pool_mint` is the token | any stake-pool LST, rate read live from the pool |
| `LaunchpadDbc` | Meteora DBC virtual pool + its config | coins launched on **our** launchpad (config's fee claimer is our PDA) |
| `ImmutableMint` | none | mints with no mint/freeze authority |
| `Any` | none | anything |

**TokenCollection** (permissionless). Anyone creates one: points at a ruleset, names a **quote mint** (WSOL, USDC) that is always admitted, an optional **anchor mint** also admitted (e.g. the protocol token), and a fee divisor.

**CollectionMember** (permissionless, rule-checked). Anyone registers a mint by supplying the proof. Nobody gates it, no committee, no DMs. Each member carries a **rate**.

### Rates are 1:1 by default

Within a collection every member is worth 1.0 of every other member unless told otherwise. A stable is a stable. For LSTs the rate is read from the stake pool (1 jitoSOL = 1.15 SOL) and anyone can refresh it, no signer. The collection creator can override.

**Rates never set an execution price.** Every trade is still priced by a curve. Rates only define what *balanced* means for the fee gate below. This matters: if a pool executed at the flat rate, any depeg would let arbs drain the good asset out at par until only the bad one is left. That cannot happen here.

## 3. Two swap paths, one pool

**Extra swap.** The pair's normal curve (x·y=k on CPMM, ticks on CLMM), full fee. Untouched. This is where members meet the outside world.

**Intra swap.** Inside a *collection pool*, any member trades against any other member directly. A collection pool is a normal Raydium pair (say PROTO/WSOL) that has been *bound* to a collection: other members get their own vaults hanging off the pool, and `intra_swap` prices between any two vaults with a StableSwap over the rate-normalised balances. That means:

- **exactly the collection rate when the pool is balanced** (1:1 for stables, 1.15 for jitoSOL/SOL),
- **bends against you as the pool skews**, so buying out a member vault costs a ruinous premium and never empties it,
- **fee = normal fee ÷ divisor** (÷100 or ÷1000, floored at 1 ppm).

So forty memes launched this week sit in one pool and trade meme-to-meme at 25 ppm instead of two hops at 2500 ppm each.

There's also a lighter version for plain pairs, `rebalance_swap`: the normal swap at fee÷divisor, allowed only if it strictly moves the pool *toward* balance. Same direction as the imbalance, overshoot, or an already balanced pool are rejected on-chain.

## 4. Why this is an invitation to arb the whole ecosystem

Every inconsistency between members is now profitable to close at a hundredth of the fee. Bots loop constantly across A…N, prices inside a collection stay tight, and when a collection pool drifts from Orca or a CEX, the *repairing* trade on OnlyKings.fun is the cheapest trade anywhere, so OnlyKings.fun reprices first and aggregators route retail flow through it at full fee. That retail flow is the revenue.

Be clear-eyed: the discounted volume is arbitrage volume, it extracts from LPs. Three things bound it. The gate only pays for trades that repair. Extraction is bounded by how far a pool is skewed, and the skew is what pulls price back. And emissions exist precisely to pay LPs for hosting the arb. One design rule falls out: weight emissions by **fees earned, never volume**, or the loop bots farm emissions too.

## 5. The launchpad

Day-zero launches happen on Meteora's dynamic bonding curve with our PDA as *partner*: 50% of post-graduation LP is liquid partner liquidity, 50% permanently locked to the creator. When a curve completes, Meteora migrates it to a DAMM v2 pool and hands the partner half to our PDA. Then a permissionless, idempotent crank runs four steps, each its own transaction:

1. **unwind** the partner position into quote + newmeme,
2. **pair_quote**: newmeme/quote CPMM pool with a third of the quote,
3. **pair_protocol**: buy protocol token with a third, newmeme/PROTO pool,
4. **join_multipool**: last third bought into newmeme through pool 2; newmeme registers in the launch collection (`LaunchpadDbc` rule) and *everything* left is deposited into the quote's launch multipool.

Result: every coin launched on the platform is instantly tradable against every other one at 25 ppm, plus against the protocol token, plus against the quote. The LP from steps 2 and 3 stays protocol-owned.

## 6. ve(3,3), the part that comes after fees exist

Vote-escrow only works once there is something to vote on, so it launches second. It is its own program (`isotope-ve`) and it runs **on top of mainnet Raydium without asking anyone**: it holds LP tokens, signs cp-swap instructions from a PDA like any user, and reads public account layouts. Nothing in it needs the collection PRs to merge.

**One vote token, many gauges.** Lock the protocol token for up to the max term; power is amount × time remaining ÷ max term, decaying linearly (Curve). Votes are cast per epoch. What you vote on is a **gauge**, one per collection.

**Payout in kind, per collection.** Solidly's move. A gauge reads its collection's quote mint and owns a vault in that mint, so the stable gauge pays USDC and the LST gauge pays SOL. Fees that arrive during epoch E are split among epoch-E voters of that gauge, pro rata, claimable once E ends. One account per claim, no checkpoints, no rebase. Epochs with fees but no votes roll forward instead of stranding.

**Where the money comes from.** The program's `treasury` PDA is the address in every LaunchLab knob: platform fee wallet, coin creator, CPMM pool creator, locked-LP NFT wallet. So it receives the curve's platform fee, the curve's creator fee, the graduated pool's creator fee forever (a permissionless `harvest_creator_fee` pulls it), and the platform half of graduated LP. Anyone can also push fees straight into a gauge.

**Recycle.** Permissionless `recycle(quote)`: take the treasury's balance of that quote, send the voter share to the routed gauge's current epoch, swap half the rest into the protocol token on our own PROTO/quote pool and deposit both sides as LP the treasury keeps. That LP is protocol-owned liquidity and its fees compound in the pool. Two guards keep a cranker from sandwiching it: a per-call cap and a minimum output derived from the pool's own pre-trade price.

**Emissions.** None at launch. The token is a claim on fees, not a promise. When emissions come, weight them by **fees earned, never volume**, or the arb loop farms them too.

**Not yet.** CLMM position escrow (fee collection from a position NFT is a different CPI shape), LP-token escrow for a second, per-collection voting layer, and the fund-share reroute that needs the Raydium PRs.

## 7. Status

Working, tested against real mainnet state and real Meteora programs on local forks:

- CPMM and CLMM forks with collections, rules, rebalance swaps, collection pools (PRs open upstream: raydium-cp-swap#79, raydium-clmm#201)
- launchpad crank program, full flow from bonding curve to multipool
- SDK module (quotes match chain to the lamport) with transaction v1 (4 KB) support
- UI rebranded, nav trimmed, Collections/Vote pages scaffolded
- ve program: locks, gauges, epoch votes, in-kind claims, sweep, treasury recycle into cp-swap POL, creator-fee harvest (9 LiteSVM tests)

Not yet: UI wired to the SDK, public-cluster deploy (testnet was frozen), LaunchLab platform config pointed at the ve treasury, audit.

Current measured rent: **17.05914292 SOL** for collection CPMM, collection CLMM, and the existing CPMM-only gauge binary. Optional launch/graduation raises this to **19.27337776 SOL**, before transaction fees, configuration, and liquidity. See [the measured breakdown](DEPLOYMENT-COSTS.md).
