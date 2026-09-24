# OnlyKings.fun production preview

This static, prerendered production site uses the same `PrelaunchWorkspace` component as the collection UI. It bundles only React and the prelaunch interface; it does not build or expose the inherited trading application's endpoints or wallet providers.

```sh
cd site
npm ci
npm run build
npm test
```

Edit `../docs/MATHS.md` and `../docs/SOLANA-STABLECOINS.md` for the published `/docs/` pages. The build generates the repository-owned HTML in `docs-content.json`, prerenders every route, and hydrates the preview forms. It needs no credentials or environment variables. `dist/` is the Vercel output directory.

Transactions remain disabled. Launch requires a separate implementation and reviewed deployment; a funding balance cannot enable this bundle.
