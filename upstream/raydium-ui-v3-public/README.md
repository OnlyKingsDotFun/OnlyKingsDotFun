# OnlyKings.fun

Solana markets for swaps, liquidity, and collections of assets with common rules.

The public identity lives in `src/constants/brand.ts`. Crown artwork, favicons,
home-screen icons, and sharing artwork are in `public/`. The interface supports
light and dark themes, desktop and mobile layouts, and the existing translations.

## Development

Use Node 24 and Yarn classic. This repository uses the local SDK fork at
`../raydium-sdk-V2`; install/build that sibling repository before installing this
frontend. Do not replace it with the public SDK package: it contains the collection
extensions used by this project.

```sh
yarn install
yarn dev
```

The app runs on port 3002. `yarn type-check` checks TypeScript; `yarn build` runs
the existing Next.js build/export pipeline.

## Product surfaces

- `/`: OnlyKings introduction and product navigation.
- `/swap`, `/liquidity-pools`, `/portfolio`: inherited Raydium market integrations.
- `/launchpad`: inherited Raydium launch integration; not the custom graduation flow.
- `/collections`, `/vote`: clearly marked integration work, not live transaction flows.
- `/docs`: product guide and current feature availability.

The interface is independently branded. Raydium SDK/package names, protocol
addresses, data-source labels, and third-party authentication messages retain their
correct identities. Wallet metadata and shared interface links use OnlyKings.fun.
The upstream analytics ID and upstream-only Solana Actions mapping are removed.

## Deployment

`onlykings.fun` is registered in the owner's Vercel account. A deployment needs the
sibling SDK, an RPC configuration, and any optional wallet/launch-service keys.
Keep credentials in environment configuration. Never commit them.

Source remains under its existing license; see `LICENSE` and preserved upstream
notices. Rebranding does not change deployed program identities or token symbols.
