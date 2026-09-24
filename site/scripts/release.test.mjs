import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const dist = new URL('../dist/', import.meta.url)
const routes = ['', 'docs/', 'docs/stablecoins/', 'about/', 'balances/', 'gauges/']
test('prerendered CSS modules match the browser stylesheet', async () => {
  const css = await readFile(new URL('assets/app.css', dist), 'utf8')
  for (const route of routes) {
    const html = await readFile(new URL(route+'index.html', dist), 'utf8')
    for (const match of html.matchAll(/class="([^"]+)"/g)) {
      for (const name of match[1].split(/\s+/).filter(name => name.startsWith('prelaunch_'))) {
        assert.ok(css.includes('.'+name), `Missing production style for ${name} on /${route}`)
      }
    }
  }
})
for (const route of routes) test(`production ${route || '/'} keeps the launch gate and footer`, async () => {
  const html = await readFile(new URL(route+'index.html',dist),'utf8')
  assert.match(html,/NOT LIVE YET/)
  assert.match(html,/17\.06/)
  assert.match(html,/https:\/\/t\.me\/onlykingsdotfun/)
  assert.match(html,/https:\/\/github\.com\/OnlyKingsDotFun\/OnlyKingsDotFun/)
  assert.match(html,/<button[^>]*disabled[^>]*>Wallets open at launch<\/button>/)
  assert.doesNotMatch(html,/<form\b/)
  for (const match of html.matchAll(/href="(\/[^"]*)"/g)) {
    const href = match[1].split(/[?#]/)[0]
    if (href.endsWith('/')) await readFile(new URL(href.slice(1)+'index.html',dist))
    else await readFile(new URL(href.slice(1),dist))
  }
})
test('protocol docs and stablecoin evidence are included in the artifact', async()=>{
 const math = await readFile(new URL('docs/index.html',dist),'utf8')
 assert.match(math,/StableSwap: the full integer algorithm/)
 assert.match(math,/Treasury recycling/)
 const evidence = JSON.parse(await readFile(new URL('research/solana-stables-snapshot.json',dist)))
 assert.equal(evidence.rpc.result.value.length,6)
 assert.equal(Object.keys(evidence.mints).length,7)
 assert.equal(evidence.usdsRpc.result.value[0].data.parsed.info.decimals,6)
})
test('production transport cannot reach wallet or RPC services',async()=>{
 const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url)))
 const csp=config.headers[0].headers.find(x=>x.key==='Content-Security-Policy').value
 assert.match(csp,/connect-src 'none'/)
 assert.match(csp,/form-action 'none'/)
})
