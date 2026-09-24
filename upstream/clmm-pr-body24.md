> The pitch, in public: https://x.com/STACCoverflow/status/2098979021828616304
> Companion PR for CP-Swap (same collection primitive, same rule, other AMM): raydium-io/raydium-cp-swap#78

# Collection rebalance swap for CLMM

## the pitch

companion to the CP-Swap token collections PR. same framing: a stable is a stable, an lst is an lst, a meme is a meme, more or less. Curve made the pool the cheapest place to keep near-substitutes near each other; Solidly made the fee flow pay whoever keeps the system honest. this PR gives CLMM pools the same intra-collection rebalance path. The collection module is mirrored into CLMM so each program is self-contained: no cross-program reads, no dependency on CP-Swap.

## what changes

Additive. No existing instruction or layout changes.

- `states/collection.rs`: `Ruleset` `["ruleset", index]` (admin only), `TokenCollection` `["token_collection", authority, index]` (permissionless, bound to a ruleset and a quote mint), `CollectionMember` `["collection_member", collection, mint]` (permissionless, rule-checked), and `target_sqrt_price_x64(rate_0, rate_1, decimals_0, decimals_1)`: the balanced price implied by member rates.
- `instructions/collection/`: `create_ruleset`, `update_ruleset`, `create_token_collection`, `update_token_collection`, `register_collection_member` (proof accounts as remaining accounts; pump.fun rule reads the bonding curve), `set_collection_member_rate`. Same code as the CP-Swap PR.
- `exact_internal_v2` now delegates to `exact_internal_v2_with_fee(..., trade_fee_rate)`; the existing path passes the config rate, so behaviour is unchanged. The fee is threaded by cloning `AmmConfig` with the effective rate, so `swap_internal`'s signature and its tests are untouched.
- `rebalance_swap_v2`: `swap_v2` accounts + `collection`, `input_member`, `output_member` (PDA-checked). LP fee is `trade_fee_rate / collection.rebalance_fee_divisor`. Accepted only if the trade direction points at the target price and `|sqrt_price - target|` strictly decreases.

## verified

- `cargo test collection`: target price for a pegged pair is exactly `2^64`; SOL(9)/USDC(6) at 150 gives raw price 0.15.
- builds with `cargo build-sbf`.
- fork demo against the live WSOL/USDC CLMM pool: against the live WSOL/USDC pool `3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv`: standard `swap_v2` charged 400 ppm, `rebalance_swap_v2` toward target charged 4 ppm; balanced-pool, same-direction and overshooting rebalances rejected with `NotRebalancing`.

## design notes

- **1:1 by default within a ruleset.** members register at rate 1.0; the target price this PR derives from member rates is therefore parity for stables and lsts unless the collection authority overrides a rate. the tick curve still prices every trade; the target only decides whether the fee is full or discounted, so parity can never be used to drain a pool.
- **the invite is ecosystem-wide arbitrage.** the trade that moves a collection pool back toward its peers is the cheap one; the trade that moves it away pays the full config fee.
- the collection module is duplicated rather than shared with CP-Swap on purpose: the two programs have no dependency on each other today and this PR keeps it that way. a mint is registered once per AMM; registration is permissionless.
