# Raydium Redux

This collection of programs adds a significant range of new features to Raydium, mostly centering around utility for the RAY token.

## Program overview

### Reactor

The `reactor` program is an escrow account for RAY tokens. This program converts RAY tokens into **vote power** (with the addition of `isoRAY` as a time-based component). The `reactor` program also provides "staking rewards" to RAY holders.

### CP LP Escrow

The `cp_lp_escrow` program is a singular escrow program for holding balances of constant-product swap (CP-Swap) LP tokens. The reason for a central program to hold balances of LP tokens is that this balance will be used for calculating `gauge` rewards (RAY emissions) and eventually "ecofarm" rewards (arbitrary emissions).

### Gauge

The `gauge` program handles RAY emissions for CP and CL markets. Gauges are voted on using `reactor` votes.

The `gauge` program has several dependecies on other programs:

- when voting on a gauge, or releasing votes, the `gauge` program locks/unlocks votes in the `reactor` program
- when calculating the amount of RAY to emit, the `gauge` program reads the quantity of liquidity tokens. For CP Swap, this dependency is with the `cp_lp_escrow` program. For CL pools, the `gauge` program reads from the pool state of the CLMM.

## Dependencies on Raydium programs

- **CP-Swap**: account types come from the published IDL (`sol/idls/raydium_cp_swap.json`, from
  [raydium-idl]) via `declare_program!`, so there is no crate dependency on `raydium-cp-swap` (its
  master is on Anchor 1.0 and cannot be mixed with Anchor 0.32 crates).
- **CLMM**: `raydium-clmm` git dependency (Anchor 0.32.1) pinned to a revision that includes the
  `update_personal_rewards` instruction the gauge CPIs into. That instruction lived on the
  `fix_guage_depend` branch and is rebased onto master in raydium-io/raydium-clmm#200.

[raydium-idl]: https://github.com/raydium-io/raydium-idl

## Dev

Check dependencies:

```
$ anchor --version
anchor-cli 0.32.1

$ solana --version
solana-cli 2.3.0 (or any Agave release with platform-tools >= 1.48)
```

Install NPM packages:

```
$ yarn
```

Run tests (must compile related TypeScript packages first)

```
$ cd sol
$ tsc --build
$ anchor test -- --features localnet
$ cargo test
```

### Client generation

We auto-generate TypeScript clients from the Anchor artifacts.

```
$ cd sol
$ anchor build
$ yarn gen
```
