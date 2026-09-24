> The pitch, in public: https://x.com/STACCoverflow/status/2098979021828616304
> Companion PR for CLMM: raydium-io/raydium-clmm#199

# Token collections + rebalance swaps for CP-Swap

## the pitch

a stable is a stable is a stable, more or less. an lst is an lst is an lst. a meme is a meme is a meme. the market already prices these as *sets*, but every AMM still treats each pair as an island. Curve figured out the first half of this a long time ago: put things that are supposed to trade near each other in one pool and make the pool itself the cheapest place to keep them there. Andre's contribution was the second half: pay the people who do the work. Solidly did not invent new curve math, it made fees and emissions flow to whoever keeps the system honest, and let everyone else build on top permissionlessly.

this PR takes that framing and applies it to CP-Swap without touching a single existing instruction:

1. **a token collection is a set, not a list.** anyone can create one. membership is decided by an admission *rule*, and anyone can register a mint by supplying the on-chain proof that the rule holds. the first rule shipped here is "standard pump.fun launch": bonding curve owned by pump, anchor type matches, PDA matches the mint, not a mayhem-mode coin. the collection's quote mint (WSOL for a meme collection, USDC for stables, SOL for LSTs) is always a member.
2. **rulesets are admin-defined, then free to use.** Raydium decides what "a stable", "an lst", "a standard meme launch" means on-chain, once. everyone composes on top of that.
3. **intra-collection rebalancing is cheap; extra-collection trading is unchanged.** `rebalance_swap_base_input` is `swap_base_input` with the LP fee divided by the collection's divisor (1/100 or 1/1000 of the config rate) and one extra rule: the trade must strictly reduce the pool's imbalance against the members' rates. same direction, overshoot, or an already balanced pool are rejected. arbs and keepers get paid in fee discount for pulling pools back toward fair; everyone else pays the normal rate. no emissions, no new token, no oracle in the swap path.

with transaction v1 (4,096 bytes, mainnet epoch 1035) the whole lifecycle fits in one transaction, and a route across a whole collection fits in one transaction. this is the primitive that makes "a collection of pools" behave like one pool.

## what changes

Additive only. No existing instruction, account layout, or PDA is modified. `swap_base_input`'s body moved into `swap_base_input_with_fee(accounts, amount_in, minimum_amount_out, trade_fee_rate, rebalance)`; the existing entry point calls it with the config rate and `None`, so behaviour is byte-for-byte identical.

New accounts (`states/collection.rs`)
- `Ruleset` `["ruleset", index]`: kind (0 any, 1 pump.fun launch, 2 immutable mint), flags, proof program id. Admin only.
- `TokenCollection` `["token_collection", authority, index]`: ruleset, quote mint, rebalance fee divisor, member count. Permissionless.
- `CollectionMember` `["collection_member", collection, mint]`: mint, rate (1e9 = 1.0), who registered it. Permissionless, rule-checked.

New instructions
- `create_ruleset`, `update_ruleset` (admin)
- `create_token_collection`, `update_token_collection`, `set_collection_member_rate` (collection authority)
- `register_collection_member` (anyone; remaining accounts carry the proof, e.g. the pump.fun bonding curve)
- `rebalance_swap_base_input` (anyone; `Swap` accounts + `collection`, `input_member`, `output_member`)

Rule evaluation lives in `instructions/collection/rules.rs` and reads only the mint and proof accounts, so membership is a pure function of chain state.

## verified

Against a mainnet fork (Surfpool, and Agave 4.3 `solana-test-validator` with cloned accounts) on the live WSOL / `73ed…pump` CP-Swap pool `2higKRf25Q9WMcYfgyK96AAuFVv5zucfDAFHHDuVETcq`:

| step | result |
|---|---|
| register `73ed…pump` with its bonding curve | ok |
| register a mayhem-mode pump coin | `RuleCheckFailed` |
| register with another coin's bonding curve | `RuleCheckFailed` |
| rebalance swap on a balanced pool | `NotRebalancing` |
| `swap_base_input` 20 WSOL | trade fee 2500 ppm |
| rebalance swap same direction | `NotRebalancing` |
| `rebalance_swap_base_input` back toward balance | trade fee 25 ppm |
| rebalance swap that overshoots | `NotRebalancing` |

Compute: register member ~14k CU, rebalance swap ~45k CU (vs ~33k for the plain swap; the extra is two member account loads and the imbalance check).

## tests

`svm-tests/` (standalone crate, own lockfile, no change to the program's `Cargo.lock`) runs the compiled program under [LiteSVM] on real mainnet state: the live WSOL/`73ed…pump` pool, its config, vaults, observation, mints, and two real pump.fun bonding curves (one standard, one mayhem). Six tests, every new instruction and every error branch:

- rulesets: admin gating, kind/flag validation, duplicate index, update
- collections: create, divisor validation, ruleset type check, update divisor/authority, authority lockout
- membership: quote-mint bypass, real standard launch, real mayhem launch rejected, allow-mayhem ruleset, require-complete ruleset, pre-v2 curve without the flag byte, wrong owner, wrong discriminator, wrong curve for mint, missing proof, ruleset mismatch, duplicate, `Any` and `ImmutableMint` rules
- member rates: authority, zero rate, cross-collection member
- rebalance swap: balanced pool rejected both ways, unchanged `swap_base_input` output vs `x*y=k`, same direction rejected, discounted fee at /100 and /500 (exact `SwapEvent.trade_fee`), overshoot rejected, member PDA from another collection rejected, collection missing a member rejected, 1 ppm floor

```sh
CPSWAP_LOCALNET_ADMIN=$(solana-keygen pubkey svm-tests/fixtures/test-admin.json) cargo build-sbf --manifest-path programs/cp-swap/Cargo.toml --features localnet
cargo test --manifest-path svm-tests/Cargo.toml
```

One finding from the suite: a divisor above the trade fee rate produced a 0 ppm fee, and the existing creator-fee split then divides by zero (`ZeroTradingTokens`). The effective rebalance fee now floors at 1 ppm.

[LiteSVM]: https://github.com/LiteSVM/litesvm

## design notes

- **1:1 by default within a ruleset.** every member registers at rate 1.0 against the collection's quote mint and against every other member. a stable is a stable, an lst is an lst. the rate only defines what "balanced" means for the rebalance fee gate; every trade is still priced by the pool's curve, so the 1:1 default can never be used to drain a pool at par during a depeg. the collection authority may override a member's rate (an lst's exchange rate, for instance). no oracle is required for the gate to work.
- **the invite is ecosystem-wide arbitrage.** whenever a collection pool is off from the rest of the market, the trade that repairs it is the cheap one, so Raydium reprices first. the direction that pushes a pool further off always pays the full config fee.
- the rebalance divisor is the collection's choice; the amm config trade fee is the ceiling it divides. if maintainers prefer LPs to opt in to discounted pools explicitly, gating on an `AmmConfig` field is a one-field addition.
- rule kinds shipped: pump.fun launch, immutable mint, any. stable and lst-by-stake-pool classes are additive follow-ups.
