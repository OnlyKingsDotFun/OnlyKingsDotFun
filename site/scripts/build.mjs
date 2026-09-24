import { build } from 'esbuild'
import { marked } from 'marked'
import { mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repo = path.dirname(root)
const ui = path.join(repo, 'upstream/raydium-ui-v3-public')
const output = path.join(root, 'dist')
await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
const docs = {}
for (const [key, file] of [['maths', 'MATHS.md'], ['stablecoins', 'SOLANA-STABLECOINS.md']]) {
  const markdown = await readFile(path.join(repo, 'docs', file), 'utf8')
  docs[key] = marked.parse(markdown) // repository-owned Markdown; never user-supplied HTML
}
await writeFile(path.join(ui, 'src/features/Pots/docs-content.json'), JSON.stringify(docs))
// Keep CSS-module identifiers identical across the server and browser bundles.
const common = { bundle: true, jsx: 'automatic', logLevel: 'info', minifySyntax: true, minifyWhitespace: true, minifyIdentifiers: false, alias: { react: path.join(root, 'node_modules/react'), 'react-dom': path.join(root, 'node_modules/react-dom') }, define: { 'process.env.NODE_ENV': '"production"' } }
await build({ ...common, entryPoints: [path.join(root, 'src/client.tsx')], outfile: path.join(output, 'assets/app.js'), platform: 'browser', target: ['es2020'] })
await build({ ...common, entryPoints: [path.join(root, 'src/render.tsx')], outfile: path.join(root, '.render/render.cjs'), platform: 'node', format: 'cjs' })
const { render } = await import(pathToFileURL(path.join(root, '.render/render.cjs')))
for (const [route, view, title] of [['', 'pots', 'Like tokens. One pot.'], ['docs', 'docs', 'Maths, fees & protocol'], ['docs/stablecoins', 'stablecoins', 'Solana stablecoin research'], ['about', 'about', 'The idea'], ['balances', 'balances', 'My balance'], ['gauges', 'gauges', 'Gauges']]) {
  const destination = path.join(output, route)
  await mkdir(destination, { recursive: true })
  await writeFile(path.join(destination, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Melting pots for like tokens on Solana. Preview the pots, read the maths, and follow the creator-fee-funded launch."><meta name="theme-color" content="#f9fafb"><title>${title} · OnlyKings.fun</title><link rel="canonical" href="https://onlykings.fun/${route ? route+'/' : ''}"><meta property="og:title" content="OnlyKings.fun — ${title}"><meta property="og:image" content="https://onlykings.fun/social-card.png"><meta name="twitter:card" content="summary_large_image"><link rel="icon" href="/favicon.svg"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="manifest" href="/site.webmanifest"><link rel="stylesheet" href="/assets/app.css"></head><body><div id="root" data-view="${view}">${render(view)}</div><script type="module" src="/assets/app.js"></script></body></html>`)
}
for (const file of ['favicon.svg','favicon.ico','apple-touch-icon.png','icon-192.png','icon-512.png','site.webmanifest','social-card.png','licenses']) await cp(path.join(ui,'public',file),path.join(output,file),{recursive:true})
await cp(path.join(repo,'docs/research'),path.join(output,'research'),{recursive:true})
await writeFile(path.join(output,'robots.txt'),'User-agent: *\nAllow: /\nSitemap: https://onlykings.fun/sitemap.xml\n')
await writeFile(path.join(output,'sitemap.xml'),'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+['','docs/','docs/stablecoins/','about/'].map(p=>`<url><loc>https://onlykings.fun/${p}</loc></url>`).join('')+'</urlset>')
console.log('Static production site built. No wallet, RPC, transaction, or server API is included.')
