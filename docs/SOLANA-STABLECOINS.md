# Stablecoins on Solana: the pot research

**Research checked 24 September 2026 UTC. No pot is live yet.** The useful starting point is a dollar pot built around verified USD-pegged mints, with a separate approach for yield-bearing dollar claims and other currencies.

[Back to the maths & fees →](/docs/) · [Download the raw on-chain snapshot](/research/solana-stables-snapshot.json)

## Proposed starting lineup

**USDC and USDT form the initial shortlist; PYUSD and USDG are the next integration candidates.** USD1, FDUSD, and USDS deserve explicit assessment rather than being omitted. This is a proposed ordering based on token structure and integration scope, not a measured liquidity ranking. Final membership, seeded balances, and executable quotes will be published before launch.

| Token | What backs the dollar claim | Solana integration | Pot treatment |
| --- | --- | --- | --- |
| USDC | Circle's reserve-backed dollar | Native issuance; legacy SPL Token | Core candidate |
| USDT | Tether reserves | Issuer-supported Solana mint; legacy SPL Token | Core candidate |
| PYUSD | Paxos-issued dollar reserves | Token-2022 with issuer controls | Next candidate; extension compatibility check |
| USDG | Paxos-issued dollar reserves | Token-2022 with issuer controls | Next candidate; extension compatibility check |
| USD1 | Dollar reserves described by World Liberty/its issuer arrangements | Official Solana mint; legacy SPL Token | Additional candidate |
| FDUSD | Cash and cash-equivalent reserves | Official Solana mint; legacy SPL Token | Additional candidate; current local market depth needed |
| USDS | Sky protocol collateral; Solana token backed through its Ethereum bridge | Legacy SPL Token; bridge path matters | Additional candidate with bridge monitoring |

The table describes issuer/protocol models, not an independent reserve audit. Direct redemption has issuer eligibility and operational requirements. A public DEX swap and direct issuer redemption are different routes.

## Verified mint registry

These addresses were cross-checked against issuer/protocol publications and read from finalized Solana state. All seven currently have **six decimals**, which fits the current intra-pot equal-decimal constraint.

| Token | Solana mainnet mint | Mint source |
| --- | --- | --- |
| USDC | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | [Circle supported networks](https://help.circle.com/support/en/usdc-supported-blockchains-minting-redemption-faqs?id=kb_article_view&sysparm_article=KB0010590) |
| USDT | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` | [Tether supported protocols](https://tether.to/en/supported-protocols/) |
| PYUSD | `2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo` | [Paxos mainnet addresses](https://docs.paxos.com/guides/stablecoin/pyusd/mainnet) |
| USDG | `2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH` | [Paxos mainnet addresses](https://docs.paxos.com/guides/stablecoin/usdg/mainnet) |
| USD1 | `USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB` | [Official reserve dashboard's Solana registry](https://por.worldlibertyfinancial.com/) |
| FDUSD | `9zNQRsGLjNKwCUU5Gq5LR8beUCPzQMVMqKAi3SSZh54u` | [First Digital network list](https://www.firstdigitallabs.com/fdusd) |
| USDS | `USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA` | [Sky bridge/token documentation](https://developers.skyeco.com/guides/skylink/usds-ethereum-solana-bridge/) |

A symbol is not an identity. Another token named USDC or USD1 is not admitted by sharing the name. A mint on Ethereum is not a Solana mint. The registry is research data, not an automatically deployed allowlist.

## What the chain actually says

The public mainnet RPC returned finalized slot **449907220** for the first six mints and **449907763** for USDS. The raw response and request timing are downloadable above.

| Token | Raw mint supply, expressed as tokens (rounded) | Token program | Mint / freeze authorities |
| --- | ---: | --- | --- |
| USDC | 8,582,816,152.92 | SPL Token | Present / present |
| USDT | 3,839,903,683.10 | SPL Token | Present / present |
| PYUSD | 744,694,941.59 | Token-2022 | Present / present |
| USDG | 631,640,496.44 | Token-2022 | Present / present |
| USD1 | 1,380,641,138.01 | SPL Token | Present / present |
| FDUSD | 8,528,077.19 | SPL Token | Present / present |
| USDS | 6,230,879.93 | SPL Token | Present / present |

**Mint supply is not pool liquidity, executable depth, or necessarily circulating supply.** Circle specifically documents pre-minted Solana USDC inventory; it must not be counted as circulating liquidity solely because it appears in the mint supply. [Circle's pre-mint explanation](https://www.circle.com/blog/new-pre-mint-address-for-usdc-on-solana).

For PYUSD and USDG, the inspected mint state includes a permanent delegate, freeze and mint authorities, metadata extensions, confidential-transfer-related extensions, a transfer-fee configuration, and a transfer-hook configuration. Both recorded transfer-fee schedules are **0 bps with a zero maximum**, and the hook program ID is **null** at this snapshot. Having a fee or hook extension does not mean a nonzero fee or an active hook is currently applied.

Issuer control can change relevant settings. Integration must use ordinary supported transfers, inspect the current configuration again before launch, and correctly account for any future transfer fees. PayPal explains the purpose of these controls in its [Token-2022 integration article](https://developer.paypal.com/community/blog/pyusd-solana-token-extensions/). The current fork's end-to-end compatibility has not been certified by this mint-state check.

## Backing and exit routes

**USDC.** Use native USDC for a direct Circle-supported redemption path. Circle Mint onboarding is distinct from a retail wallet's ability to sell USDC on a DEX. Wrapped bridge representations require their own verification and should not inherit native USDC's identity. [Circle network and redemption guide](https://help.circle.com/support/en/usdc-supported-blockchains-minting-redemption-faqs?id=kb_article_view&sysparm_article=KB0010590).

**USDT.** Tether confirms Solana support and describes reserves that extend beyond cash alone. The appropriate comparison is the issuer's current reserve disclosures and redemption access, alongside on-chain liquidity. [Tether FAQ](https://tether.to/en/faqs/).

**PYUSD and USDG.** Paxos offers mint/redeem access to onboarded institutional customers and describes dollar deposits, Treasuries, and cash equivalents as reserves. Its issuer-side liquidity offering is not the same as unlimited liquidity inside an OnlyKings pool. [Paxos mint and redeem](https://www.paxos.com/mint-and-redeem), [USDG onboarding](https://docs.paxos.com/guides/stablecoin/usdg/quickstart).

**USD1.** The official site and reserve dashboard are the starting points for backing, attestation, and network identity. Direct redemption eligibility should be checked with the current issuer route before relying on it to rebalance a pool. A dashboard listing is not proof of executable market depth. [USD1 overview](https://worldlibertyfinancial.com/usd1), [reserve dashboard](https://por.worldlibertyfinancial.com/).

**FDUSD.** First Digital publishes the Solana mint and reserve reports. Its current issuer site identifies FD121 (BVI) Limited; older descriptions using only a Hong Kong issuance structure are incomplete. Primary mint/redeem is for eligible onboarded clients, with jurisdictional restrictions. [FDUSD network and reserves](https://www.firstdigitallabs.com/fdusd), [issuer and redemption information](https://www.firstdigitallabs.com/).

**USDS.** Sky describes protocol collateral backing USDS. Its bridge documentation describes the Solana representation as backed 1:1 by Ethereum USDS and documents a transition from Wormhole to LayerZero while preserving the token mint. That document is not a live bridge-health check. Verify the active bridge, pause state, limits, and redemption route before using it operationally. [Sky USDS overview](https://sky.money/blog/what-is-usds), [bridge specification](https://developers.skyeco.com/guides/skylink/usds-ethereum-solana-bridge/).

## Dollar tokens that need a different treatment

| Asset or class | Why the treatment differs |
| --- | --- |
| USDe | Ethena's synthetic dollar uses hedged asset exposure and derivatives infrastructure. Assess those mechanics and the Solana representation separately from reserve-backed payment dollars. |
| sUSDe | A staked savings claim. Use its redemption exchange rate rather than assuming one share is one dollar. |
| sUSDS / other savings vault shares | Savings shares and the underlying USDS are distinct tokens. Verify chain availability, bridge representation, and rate conversion before proposing membership. |
| USDY | Ondo explicitly describes USDY as a yieldcoin rather than a stablecoin. Its dollar value accrues; a changing rate and eligibility model are needed. |
| EURC | Circle's euro-backed token on Solana. It belongs in a euro-denominated design or a properly priced FX market, not a 1:1 USD pot. |
| Lending receipts, LP tokens, wrapped bridge variants | Their underlying assets, exchange rates, and exit paths determine value. The ticker alone is insufficient. |

Sources: [Ethena protocol overview](https://docs.ethena.fi/), [Ethena Solana ecosystem support](https://ethena.fi/ecosystem), [Sky savings/token distinctions](https://sky.money/blog/understanding-the-sky-token), [Ondo USDY](https://ondo.finance/usdy), [Circle EURC](https://www.circle.com/eurc).

This is not an exhaustive catalogue of every Solana dollar token. Further candidates such as USX, USDH, and protocol-specific synthetic dollars need their own current issuer/mint, backing, and liquidity verification before entering the proposed registry. None is silently admitted from a third-party token list.

## Liquidity: what was measured and what is missing

The mint-state reads succeeded. The public Raydium pool endpoint and a separate DEX pool-data request returned HTTP 403 in this environment. Consequently, **no current pool TVL, trading-volume ranking, or executable depth is claimed here**. Request failures are preserved in the snapshot, and the preview deliberately shows no invented balances or quotes.

The launch assessment should measure both directions at representative sizes, such as 100, 1,000, 10,000, and 100,000 dollars, recording the exact slot/time, route, fees, output, minimum receipt, and price impact. Compare Raydium, Orca, Meteora, and aggregator routes without summing duplicated pools. Record out-of-range concentrated liquidity separately from liquidity that a trade can actually use. An issuer's redemption capacity and a pool's on-chain inventory answer different questions.

## How this changes the OnlyKings stable pot

- Publish exact mints and their issuer/protocol sources; the initial preview names USDC, USDT, PYUSD, and USDG as candidates.
- Keep USD-pegged payment tokens, yield-accruing shares, and other currency units identifiable even if later routing makes them equally simple to use.
- Seed supported member vaults with positive balances; the current StableSwap solver does not quote across an empty constituent.
- Select amplification, fee divisor, and rates from actual liquidity and token behavior. Do not publish an APY or a guaranteed 1:1 finite-trade receipt.
- Configure membership explicitly before launch. The source's general `Any` rule is not stablecoin verification, while `ImmutableMint` excludes these issuer-controlled candidates.
- Recheck authorities, extension configuration, bridge health where relevant, and supported transfer behavior at launch. An official mint check alone is not a contract integration test.

The user experience stays small: pick the dollar pot, choose what goes in and out, and see the actual receipt and fees. This page explains what has to sit underneath that simplicity.
