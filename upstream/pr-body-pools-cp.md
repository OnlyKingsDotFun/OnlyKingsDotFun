> Stacked on #78 (token collections). Companion CLMM PR: raydium-io/raydium-clmm#201.

# Collection pools: the multipool

a meme is a meme is a meme. Members of a collection should trade against **each other**, on one pool's own terms, not through the quote leg. This PR turns a CP-Swap pair into that pool.

## what changes

Additive; nothing existing is modified.

- `init_pool_members(amp)`: bind a pair that holds the collection's quote mint to the collection (pool creator or admin). The pool's other token becomes member 0 and keeps its existing vault and fee fields. A collection with an `anchor_mint` can anchor the pool on e.g. protocol-token/quote.
- `add_pool_member`: permissionless. Any mint that is already a member of the collection and matches the base's decimals gets its own vault under the pool authority.
- `intra_swap(from, to, amount_in, min_out)`: swap any member for any other member inside the pool, base included. Priced by a Curve StableSwap over the members' rate-normalised reserves: **exactly the collection rate (1:1 unless set) when the pool is balanced, bending against the trader as it skews.** Fee is `trade_fee_rate / rebalance_fee_divisor` (1 ppm floor), split protocol / fund like any swap; base-side fees accrue on `PoolState`, member fees on `PoolMembers`.
- `collect_member_fees`: protocol owner / fund owner / admin collects from a member vault.

The pair's own `x*y=k` curve against the quote is untouched: that is the **extra** swap, where members meet the outside world.

## why a curve and not the flat rate

Executing at the flat rate makes a pool a free option on every external price move: arbs drain the now-cheap member at the stale rate until only the worst asset is left. StableSwap keeps the rate as the price at balance and makes extraction cost more the further the pool is pushed. The test buys out a member vault with 100× its size in base and receives less than the reserve; the vault never reaches zero. The volume this invites is arbitrage between members A..N; what arbs can extract is bounded by how far the pool is skewed, and the skew is what pulls price back.

## tests

`svm-tests/tests/collection_pool.rs` on the live WSOL/`73ed…pump` pool: bind gating and amp validation, member add (duplicate, non-member, decimals), swaps in every direction, exact fee from `IntraSwapEvent`, member fee accounting, curve bending on consecutive sales, bounded extraction, wrong vault / index, fee collection gating. Plus the nine collection tests from #78. Verified end to end on a Surfpool mainnet fork and on Agave 4.3 with cloned accounts.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
