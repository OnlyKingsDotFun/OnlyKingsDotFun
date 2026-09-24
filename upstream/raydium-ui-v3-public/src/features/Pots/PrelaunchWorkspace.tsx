/*
 * Interface patterns adapted from the MIT-licensed July 2020 iearn frontend.
 * Copyright (c) 2020 iearn. See /licenses/yearn-ui-MIT.txt and docs/UI-REFERENCES.md.
 */
import { useState } from 'react'
import BrandLogo from '../../icons/BrandLogo'
import { ONLYKINGS_LAUNCH as launch } from '../../constants/launch'
import ProtocolDocs from './ProtocolDocs'
import StablecoinDocs from './StablecoinDocs'
import styles from './prelaunch.module.css'

const pots = [
  { id: 'dollars', symbol: '$', name: 'Dollar pot', description: 'Different tokens. The same dollar idea.', tokens: ['USDC', 'USDT', 'PYUSD', 'USDG'], rate: '1:1 base rate' },
  { id: 'sol', symbol: '◎', name: 'SOL + LST pot', description: 'SOL and liquid staking tokens, together.', tokens: ['SOL', 'stacSOL', 'JitoSOL', 'bSOL'], rate: 'SOL value' },
  { id: 'pump', symbol: 'p', name: 'Pump.fun pot', description: 'Non-mayhem pump.fun memecoins.', tokens: [], rate: 'Pot’s rate' }
] as const

type Pot = (typeof pots)[number]
type Action = 'Swap' | 'Deposit' | 'Withdraw'

export default function PrelaunchWorkspace({ view = 'pots' }: { view?: string }) {
  const [expanded, setExpanded] = useState<string | null>('dollars')

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <a href="/" className={styles.brand} aria-label="OnlyKings.fun home">
            <BrandLogo width="32" height="32" />
            <span>OnlyKings<span className={styles.muted}>.fun</span></span>
          </a>
          <div className={styles.headerRight}>
            <span className={styles.network}>Solana</span>
            <button className={styles.walletButton} disabled>Wallets open at launch</button>
          </div>
        </header>

        <section className={styles.launch} aria-labelledby="launch-heading">
          <div className={styles.launchTop}>
            <div>
              <span className={styles.status}><span aria-hidden>●</span> NOT LIVE YET</span>
              <h2 id="launch-heading">Creator fees fund the launch.</h2>
              <p>Launch waits until OnlyKingsDotFun’s pump.fun creator fees cover roughly 17.06 SOL plus deployment costs. At launch, the team will initialize a SOL + LST pool, a stablecoin pool, and a non-mayhem pump.fun memecoin pool.</p>
            </div>
            <div className={styles.target}>
              <span>Deployment target</span>
              <strong>{launch.targetSol} <small>SOL</small></strong>
              <span>plus transaction &amp; setup costs</span>
            </div>
          </div>
          <div className={styles.launchBottom}>
            <span>Team-funded · No deposits open</span>
            <details className={styles.budgetDetails}>
              <summary>What needs deploying?</summary>
              <div className={styles.budgetBody}>
                <p>Both collection pool engines and the gauge program need deployment before pots can open.</p>
                <dl>
                  {launch.programRent.map((program) => <div key={program.name}><dt>{program.name}</dt><dd>{program.sol} SOL</dd></div>)}
                  <div><dt>Current binary rent total</dt><dd>17.05914292 SOL</dd></div>
                </dl>
                <p>Transaction fees and initial setup are extra. Final builds may change the total. CLMM gauge integration is still in progress.</p>
                <p><strong>Verified creator-fee earnings:</strong> not published yet. We will show verified funding and deployed addresses before enabling transactions.</p>
              </div>
            </details>
          </div>
        </section>

        <nav className={styles.nav} aria-label="OnlyKings navigation">
          {[
            ['pots', 'Pots'], ['balances', 'My balance'], ['gauges', 'Gauges'], ['about', 'The idea'], ['docs', 'Docs']
          ].map(([key, label]) => <a key={key} href={key === 'docs' ? '/docs/' : key === 'pots' ? '/' : `/${key}/`} aria-current={view === key ? 'page' : undefined}>{label}</a>)}
        </nav>

        <main>
          {view === 'docs' ? <ProtocolDocs /> : view === 'stablecoins' ? <StablecoinDocs /> : view === 'about' ? <Guide /> : view === 'balances' ? (
            <section className={styles.empty}><h1>Your tokens. Your pot shares.</h1><p>Balances appear here after launch and wallet connection.</p><p>No deposits or withdrawals are open yet.</p></section>
          ) : view === 'gauges' ? (
            <section className={styles.empty}><h1>A say in your pots.</h1><p>Gauges will let you vote on where fees go.</p><p>Voting, locks, and claims open after the contracts are deployed and verified.</p></section>
          ) : (
            <>
              <div className={styles.intro}><h1>Like tokens. One pot.</h1><p>Pick a pot. Put one token in. Take another out.</p></div>
              <div className={styles.listHeader}><span>Three pots planned for launch</span><span>Preview · Not deployed</span></div>
              <div className={styles.potList}>
                {pots.map((pot) => (
                  <section key={pot.id} className={styles.pot}>
                    <button className={styles.potSummary} aria-expanded={expanded === pot.id} aria-controls={`pot-${pot.id}`} onClick={() => setExpanded(expanded === pot.id ? null : pot.id)}>
                      <span className={styles.potSymbol} aria-hidden>{pot.symbol}</span>
                      <span className={styles.potName}><strong>{pot.name}</strong><span>{pot.tokens.length ? pot.tokens.join(' + ') : 'Non-mayhem memecoins only'}</span></span>
                      <span className={styles.potRate}>{pot.rate}<small>Reference</small></span>
                      <span className={styles.preview}>Preview</span>
                      <span className={styles.expand} aria-hidden>{expanded === pot.id ? '−' : '+'}</span>
                    </button>
                    {expanded === pot.id && <div id={`pot-${pot.id}`} className={styles.potBody}><PotForm key={pot.id} pot={pot} /></div>}
                  </section>
                ))}
              </div>
              <p className={styles.note}>Like for like, at the pot’s rate. The final amount includes fees and the pot’s balance.</p>
            </>
          )}
        </main>

        <footer className={styles.footer}>
          <span>OnlyKings.fun · Preview before launch</span>
          <div><a href="/docs/">Docs &amp; maths</a><a href="https://github.com/OnlyKingsDotFun/OnlyKingsDotFun" target="_blank" rel="noreferrer">GitHub ↗</a><a href="https://t.me/onlykingsdotfun" target="_blank" rel="noreferrer">Telegram ↗</a></div>
        </footer>
      </div>
    </div>
  )
}

function PotForm({ pot }: { pot: Pot }) {
  const [action, setAction] = useState<Action>('Swap')
  const [from, setFrom] = useState<string>(pot.tokens[0] || '')
  const [to, setTo] = useState<string>(pot.tokens[1] || '')
  const [amount, setAmount] = useState('')
  const inputId = `${pot.id}-amount`
  const selectToken = (value: string, side: 'from' | 'to') => {
    if (side === 'from') {
      setFrom(value)
      if (value === to) setTo(from)
    } else {
      setTo(value)
      if (value === from) setFrom(to)
    }
  }

  if (!pot.tokens.length) return <p className={styles.unconfigured}>This pot will bring together non-mayhem pump.fun memecoins. The team will initialize it at launch; the token lineup will be published then.</p>

  return (
    <>
      <div className={styles.actions} aria-label="Preview action">
        {(['Swap', 'Deposit', 'Withdraw'] as const).map((item) => <button key={item} aria-pressed={action === item} onClick={() => setAction(item)}>{item}</button>)}
      </div>
      <p className={styles.potDescription}>{pot.description} {pot.id === 'dollars' && <a href="/docs/stablecoins/">Candidate research ↗</a>}</p>
      <div className={styles.formGrid}>
        <div className={styles.field}>
          <div className={styles.fieldHeading}><label htmlFor={inputId}>{action === 'Withdraw' ? 'Pot shares to withdraw' : 'You put in'}</label><span>Balance —</span></div>
          <div className={styles.amountBox}>
            <input id={inputId} inputMode="decimal" autoComplete="off" placeholder="0.00" value={amount} onChange={(event) => { if (/^\d*(\.\d*)?$/.test(event.target.value)) setAmount(event.target.value) }} />
            {action === 'Withdraw' ? <span className={styles.share}>Pot share</span> : <select aria-label="Token you put in" value={from} onChange={(e) => selectToken(e.target.value, 'from')}>{pot.tokens.map((token) => <option key={token}>{token}</option>)}</select>}
          </div>
        </div>
        <button className={styles.direction} disabled={action !== 'Swap'} aria-label="Reverse swap direction" onClick={() => { setFrom(to); setTo(from) }}>⇄</button>
        <div className={styles.field}>
          <div className={styles.fieldHeading}><span>{action === 'Deposit' ? 'Your pot shares' : 'You take out'}</span><span>Quote after launch</span></div>
          <div className={styles.amountBox}>
            <output aria-label="Amount received">—</output>
            {action === 'Deposit' ? <span className={styles.share}>Pot share</span> : <select aria-label="Token you take out" value={to} onChange={(e) => selectToken(e.target.value, 'to')}>{pot.tokens.map((token) => <option key={token}>{token}</option>)}</select>}
          </div>
        </div>
      </div>
      <div className={styles.quoteDetails}><span>Fee <strong>—</strong></span><span>Minimum received <strong>—</strong></span></div>
      <button className={styles.submit} disabled>{action} opens after launch</button>
      <p className={styles.formNote}>Preview only. No wallet connection, live quote, or transaction.</p>
    </>
  )
}

function Guide() {
  return <section className={styles.guide}>
    <h1>A melting pot for like tokens.</h1>
    <p>Dollar tokens with dollar tokens. SOL with liquid staking tokens. Non-mayhem pump.fun memecoins together. Pick what you have and what you want from the same pot.</p>
    <h2>Put one in. Take another out.</h2>
    <p>Choose a pot, choose your tokens, and enter an amount. At launch, you will see the amount received and all fees before confirming in your wallet.</p>
    <h2>One-to-one is the starting point.</h2>
    <p>The default reference rate is 1:1. Staked tokens can use the SOL value underneath. The final quote accounts for the rate, fees, and token balance in the pot. Exact formulas and configuration are in the docs.</p>
    <h2>Launch is funded by creator fees.</h2>
    <p>The OnlyKingsDotFun team must earn about {launch.targetSol} SOL plus transaction and setup costs from its pump.fun creator fees. The team will then deploy and verify the contracts and initialize three pots: SOL + LSTs, stablecoins, and non-mayhem pump.fun memecoins. Funding alone does not switch the app on.</p>
    <details><summary>Technical details &amp; interface credits</summary><p>Collection CPMM, collection CLMM, and gauges are the core programs. The current gauge supports CPMM collections; CLMM gauge integration is unfinished. Launch and graduation are optional.</p><p>This interface adapts the expandable asset rows and simple input forms of the <a href="https://github.com/yearn/iearn-finance/tree/47abaa50a019ad747105fdf835ed18462abb3236" target="_blank" rel="noreferrer">July 2020 Yearn frontend</a>. <a href="/licenses/yearn-ui-MIT.txt">MIT license</a>. OnlyKings is an independent project.</p></details>
  </section>
}
