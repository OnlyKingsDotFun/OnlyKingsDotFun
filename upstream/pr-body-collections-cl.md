> The pitch, in public: https://x.com/STACCoverflow/status/2098979021828616304
> Companion CLMM PR: raydium-io/raydium-cp-swap#78. The multipool itself (intra swaps inside a pair) is stacked on this as #201.

# Token collections

a stable is a stable is a stable, more or less. an lst is an lst is an lst. a meme is a meme is a meme. the market already prices these as *sets*; every AMM still treats each pair as an island. This PR adds the primitive that lets CLMM know about the set.

## what changes

Additive. No existing instruction, account layout or PDA is modified. `exact_internal_v2` delegates to `exact_internal_v2_with_fee(..., trade_fee_rate)`; the existing `swap_v2` passes the config rate, so behaviour is unchanged (the fee is threaded by cloning `AmmConfig`, so `swap_internal` and its tests are untouched). The collection module is mirrored into CLMM on purpose: no dependency on CP-Swap; a mint registers once per AMM.

**Three new accounts**

- `Ruleset` `["ruleset", index]`, **admin-defined**: what counts as a member. Kinds shipped: `PumpFunLaunch` (the mint's pump.fun bonding curve is the proof: owned by pump, Anchor type matches, PDA matches the mint, not mayhem-mode), `Lst` (proof: the SPL stake pool whose `pool_mint` is the member), `LaunchpadDbc` (proof: a Meteora dynamic-bonding-curve virtual pool + its config, whose `fee_claimer` is the ruleset's partner key), `ImmutableMint`, `Any`. Rules read only the mint and the proof accounts, so membership is a pure function of chain state.
- `TokenCollection` `["token_collection", authority, index]`, **permissionless**: points at one ruleset, a quote mint (always admitted), an optional `anchor_mint` (also admitted, so a collection pool can be anchored on a pair the rule would not admit), and a `rebalance_fee_divisor`.
- `CollectionMember` `["collection_member", collection, mint]`, **permissionless, rule-checked**: anyone registers a mint by supplying the proof. Carries a `rate` (1e9 = 1.0) valuing the member in the quote.

**Rates are 1:1 by default.** A stable is a stable, an LST is an LST: every member registers at 1.0 against the quote and against every other member. For `Lst` rulesets the rate is instead read from the stake pool at registration and anyone can refresh it with `sync_member_rate` (no signer). The collection authority may override a rate. Rates never set an execution price: they only define what "balanced" means for the fee gate below, and every trade is still priced by a curve. A 1:1 default therefore cannot be used to drain a pool at par during a depeg.

**One new swap path.** `rebalance_swap_v2` is `swap_v2` with the LP fee divided by `rebalance_fee_divisor` (1 ppm floor) and one extra rule: the trade must move `sqrt_price_x64` strictly toward the target price implied by the member rates. Same-direction, overshooting, and balanced-pool trades are rejected (`NotRebalancing`). The direction that repairs a pool is cheap; the direction that pushes it off pays the full config fee. That is the invite to ecosystem-wide arbitrage: when a collection pool is off from the rest of the market, repairing it here is the cheapest trade anywhere, so Raydium reprices first.

## instructions

`create_ruleset`, `update_ruleset` (admin); `create_token_collection`, `update_token_collection`, `set_collection_member_rate` (collection authority); `register_collection_member`, `sync_member_rate`, `rebalance_swap_v2` (anyone). Account lists are documented on each handler.

## tests

`svm-tests/` (standalone crate, own lockfile) runs the compiled program under LiteSVM on real mainnet state: the live WSOL/USDC pool `3ucNo…`, its config, vaults, observation, bitmap extension and the tick arrays around the current tick. Six tests cover every instruction and error branch, including every rule kind's negative cases, `anchor_mint`, LST rate sync, and the discounted fee recovered from the protocol-fee delta at /100 and /500 (400 ppm standard vs 4 ppm).

```sh
cargo build-sbf --manifest-path programs/amm/Cargo.toml
cargo test --manifest-path svm-tests/Cargo.toml
```

One finding from the suite: a divisor above the trade fee rate produced a 0 ppm fee, which makes downstream math divide by zero. The effective fee now floors at 1 ppm.

## for maintainers

- admin gating is covered negatively only (the localnet admin key is not distributed); rulesets are seeded directly for the permissionless paths.
- the divisor is the collection creator's choice; if LPs should opt in to discounted pools explicitly, gating on an `AmmConfig` field is a one-field addition.
- verified on a Surfpool mainnet fork with the patched bytecode at the real program id, and on Agave 4.3 `solana-test-validator` with cloned accounts, where the whole lifecycle ran as one 4,096-byte transaction v1.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
