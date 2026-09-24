# OnlyKings.fun

**Good assets. Better together.**

Solana markets for swaps, liquidity, and collections of assets with common rules.
This monorepo contains the OnlyKings web interface, custom programs, SDK, and
source forks used by the collection-market stack.

## Source map

| Path | Purpose |
| --- | --- |
| `upstream/raydium-ui-v3-public` | OnlyKings web app, crown identity, wallet UI, light/dark themes |
| `upstream/raydium-sdk-V2` | Collection-aware SDK and transaction builders |
| `upstream/raydium-cp-swap` | Constant-product collection pools |
| `upstream/raydium-clmm` | Concentrated-liquidity collection pools |
| `programs/isotope-launch` | Launch and graduation orchestration |
| `programs/isotope-ve` | Vote escrow, gauges, fee claims, treasury recycling |
| `upstream/dynamic-bonding-curve` | Meteora source and integration test harness |
| `upstream/ray-gauges` | Gauge, reactor, and LP-escrow research fork |
| `program` | Original collection-AMM prototype |

## Delivery scope

The requested product is **collection CPMM + collection CLMM + gauges**. Launch /
graduation and Meteora are optional components, not required deployments for that
scope. Both collection AMM forks exist. The custom gauge currently validates only
CPMM-owned collections; CLMM gauge support and the live collections/voting UI are
unfinished. The separate ray-gauges fork is also included for reference.

The historical Rust crate and SDK names stay unchanged for compatibility. Public
product identity is OnlyKings.fun. See [the product model](docs/ONLYKINGS.md),
[deployment costs](docs/DEPLOYMENT-COSTS.md), and the web app README.

## Run the web app

The production prelaunch site lives in `site/` and uses the shared OnlyKings UI.
Run `npm ci --prefix site`, `npm run build --prefix site`, and `npm test --prefix site`.
Its published routes include [protocol maths](https://onlykings.fun/docs/) and
[Solana stablecoin research](https://onlykings.fun/docs/stablecoins/).
Financial actions remain closed pending funding and verified contract deployment.

For the inherited full trading interface and SDK development:

Use Node 24 and Yarn classic. Build the local SDK, then run the frontend:

```sh
cd upstream/raydium-sdk-V2
yarn install
yarn build
cd ../raydium-ui-v3-public
yarn install
yarn dev
```

Open `http://localhost:3002`. The landing page explains the product; Swap, Pools,
and Portfolio use inherited market integrations. Collections and Vote show their
current integration status. The custom graduation and voting flows are not yet
connected to live frontend transactions.

## Source and deployment hygiene

This is a fresh source snapshot. Git history contains OnlyKingsDotFun authorship;
upstream licenses and copyright notices remain with their source files. Nested
forks are vendored source directories, not inaccessible git submodules.

Wallet files, deploy keypairs, local credentials, build caches, and compiled
programs are excluded. Generate local test identities and build fixture programs
before running harnesses that expect those files. Do not reuse test identities
for a production deployment. Program IDs and service configuration require an
explicit deployment setup; this repository is not evidence of a mainnet launch.
