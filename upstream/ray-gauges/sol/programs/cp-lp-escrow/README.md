# CP LP ESCROW

Holds LP tokens in escrow, in order to earn rewards from the `farm` and the `gauge`.

## Background

LP tokens in the CP-Swap are fungible receipts for depositing into an AMM pool. There are two classifications of incentives for holding LP tokens:

- RAY rewards (controlled by the `gauge` program)
- Arbitrary rewards (controlled by the `farm` program)

When LP tokens are deposited into this escrow account, the owner earns from both of these streams.

The reason for making this a separate program is that CP-Swap LP tokens are not the only tokens that earn rewards via the `gauge` or `farm` programs. NFTs held by CLMM users also connect with these reward streams. And thus `gauge` and `farm` ought to be loosely coupled to the implementation for how "liquidity" is quantified.

## API

When a user deposits/withdraws LP tokens into escrow, the program must first synchronize _all_ of their rewards. This involves CPI calls both into the `gauge` and `farm` programs to update the user's balances of earned rewards.
