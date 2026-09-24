# Stonk creator fees → creator LST reserve

Status: implemented locally as `programs/creator-inbox`, with compiled-SBF tests.
Not deployed. This does not open the prelaunch site's financial actions.

The selected route is **standard Stonk LaunchLab launches quoted in SOL**.
Each launch names its dedicated inbox PDA as `creator`. Stonk's standard creator
share is forwarded there by Stonk's service. SOL already received can be settled
by anyone into the master LST's fixed reserve, with on-chain attribution.

```text
Stonk standard memecoin A ── creator fees ── inbox A ─┐
Stonk standard memecoin B ── creator fees ── inbox B ─┼─ settle ─ LST reserve
Voluntary SOL contributions ─────────────── inbox X ─┘
                                                   + contribution counters
```

## What is enforced

- Creator-root initialization requires the manager recorded in the actual
  Sanctum stake-pool account. Reserve and LST mint are read from that account.
- Inbox registration is permissionless. It verifies a LaunchLab-owned pool at
  its canonical PDA, the pinned Stonk standard SOL platform/config, and that
  the pool's `creator` equals this exact inbox. A third party cannot register an
  existing pool to a different root by choosing a different reserve.
- Bindings are immutable in this program. There is no destination setter,
  withdrawal instruction, close instruction, generic CPI, or operator drain.
- The only credited amount is native SOL actually forwarded to the configured
  reserve. The program does not label that amount as proven trading revenue.
  Voluntary contributions count too.
- Settlement never calls Stonk's claim/distribution API and never requires
  pending creator fees. A payout triggered earlier still sits in the inbox or
  its WSOL account and is settled normally. Empty/repeated calls add no credit.
- Root totals, per-meme totals, and the SOL movement commit together or all
  revert. Checked `u128` counters preserve cumulative amounts exactly.
- Direct donations to the shared reserve are not attributed to a memecoin.

## Accounting

Let `B_i` be inbox lamports and `R_i` its rent-exempt minimum. Native settlement
forwards `D_i = B_i - R_i`, requiring `B_i >= R_i`, then leaves `R_i` behind:

```text
inbox.contributed_lamports += D_i
creator.contributed_lamports += D_i
reserve.lamports += D_i
inbox.lamports = R_i
```

WSOL settlement synchronizes the inbox's canonical classic-SPL WSOL ATA, then
transfers its token balance to a temporary PDA token account and closes that
temporary account into the inbox. The receiving ATA stays open with its rent.
If the caller advances `F` lamports to initialize the temporary account, exactly
`F` is returned before settlement. Any SOL prefunded into the temporary PDA is
a contribution, not money the caller can claim as a reimbursement.

```text
F = max(0, temporary_account_rent - temporary_prefunding)
WSOL contribution = synchronized_source_amount + temporary_prefunding
caller rent change = -F + F = 0
```

The transaction fee remains the caller's cost. A keeper can skip an empty WSOL
account to avoid unnecessary CPIs. Rent for the permanent root/inbox/receiving
ATA is setup cost. If an inbox receives money before registration, its first
rent minimum is retained, and only its excess can be forwarded. Prefunding
never prevents initialization.

These counters can supply downstream allocation weights, but **this program
does not implement reward epochs, weighting, fee-LST redemption or memecoin
liquidity donations**. In particular, recycling the same SOL through a future
return path must not be confused with independent new revenue.

## Stonk boundary

Stonk's current [developer documentation](https://stonkfun.xyz/developers) says:

- Standard LaunchLab creator payments are automatically forwarded by Stonk.
- Reward mode assigns withheld-transfer-fee authority to Stonk and distributes
  to holders; it provides no creator-fee stream for this route.
- Older Fee Key NFT claims and older creator/quote vaults are different flows.

Accordingly, this adapter accepts current standard SOL launches only. It does
not assume control of Stonk's Token-2022 tax authority, sign for Stonk, or turn
its off-chain forwarding service into an on-chain permissionless collector.
If Stonk forwarding pauses, unforwarded fees are outside this inbox's control.

The master LST may separately have mint/redemption/Token-2022 fees, configured
in its own pool. Those are not the standard memecoin's fees.

A new launch is constructed directly against LaunchLab, with a normal payer
and mint signer and the inbox PDA as the **non-signing** creator account. The
unsigned builder fetches current Stonk pricing and appends the platform curve
rule. It returns launch + inbox registration + WSOL ATA creation instructions
for one atomic transaction. There is no web-wallet signature from the PDA.

Stonk adoption and automatic payment delivery to that off-curve creator still
need a funded live integration check after deployment. Local tests do not run
Stonk's backend or establish that its forwarding service supports PDA-owned
recipients. Do not advertise a live automatic fee stream before that check.

## Sanctum boundary

This version pins Sanctum's `SP12tWFxD9oJsVWNavTTBZvMbA6gkAmxtVgxdqvyvhY`
stake-pool deployment and its documented StakePool layout. Use it with the
creator's single-validator stake pool on that deployment. It rejects arbitrary
program owners, changed reserves/mints, non-reserve stake accounts, and pools
with no outstanding LST supply. It does not create the stake pool or enforce a
validator-count policy. Other Sanctum deployments need an explicit adapter.

Settlement donates SOL; it does not invoke `DepositSol` or mint LSTs. Updating
the stake pool's reported backing/exchange rate remains the pool's maintenance
flow, including its own reward-fee rules. A contribution counter is not an
exchange-rate oracle or a claim of immediately updated backing statistics.

Source: Sanctum's [StakePool state](https://github.com/igneous-labs/sanctum-spl-stake-pool/blob/sanctum-spl-pool-deploy/stake-pool/program/src/state.rs).

## Instruction ABI

Instruction data is exactly one byte; trailing bytes are rejected.
`s` means signer; `w` means writable. Account order matters.

| Byte | Instruction | Accounts |
| --- | --- | --- |
| 0 | InitializeCreator | payer(s,w), pool manager(s), root(w), stake pool, reserve, System Program |
| 1 | RegisterStonk | payer(s,w), root, inbox(w), meme mint, LaunchLab pool, System Program |
| 2 | SettleSol | root(w), inbox(w), stake pool, reserve(w) |
| 3 | SettleWsol | root(w), inbox(w), stake pool, reserve(w), rent payer(s,w), inbox WSOL ATA(w), unwrap PDA(w), WSOL mint, Token Program, System Program |

PDAs under this program:

```text
root   = ["creator", stake_pool]
inbox  = ["inbox", root, meme_mint]
unwrap = ["unwrap", inbox]
```

The receiver ATA is the standard Associated Token Program derivation for the
inbox owner, classic Token Program and WSOL mint. It must have no delegate or
separate close authority. Never send a non-SOL quote token to this version.

Both state accounts are 122 bytes: 8-byte tag, version `u8`, bump `u8`, three
32-byte keys, and a little-endian `u128` contribution counter at offset 106.
Tags and key meanings are in `programs/creator-inbox/src/state.rs`. The JS
decoder returns counters as `bigint`.

Errors 7000–7009 respectively mean invalid account, PDA, signer/authority,
writable privilege, already initialized, state, stake pool, launch, token
account, or arithmetic overflow.

## Build and test

From the repository root:

```sh
CARGO_BUILD_JOBS=2 cargo build-sbf --manifest-path programs/creator-inbox/Cargo.toml
CARGO_BUILD_JOBS=2 RUST_LOG=error cargo test -p creator-inbox --features svm-tests --test svm
npm ci --ignore-scripts
npm run test:inbox-client
```

The SVM tests execute `target/deploy/creator_inbox.so`, not a mocked native
processor. They use synthetic external account fixtures and the SPL Token
program. They cover prefunding, payouts before settlement, repeated settlement,
multiple memecoins, native/WSOL conservation, rent refunds, destination binding,
overflow rollback after token CPIs, and invalid pool/mint/authority inputs.

The unsigned builders are in `scripts/creator-inbox.mjs`:

```js
import {
  initializeCreator, fetchStonkSolPricing, buildStonkLaunch,
  settleSol, settleWsol, decodeState,
} from './scripts/creator-inbox.mjs';

// Supply the DEPLOYED program ID and verified creator pool/reserve addresses.
// No builder loads a key, signs, sends a transaction, or changes an API record.
const rootInstruction = initializeCreator({ programId, payer, manager, stakePool, reserve });
const pricing = await fetchStonkSolPricing();
const plan = buildStonkLaunch({
  programId, payer, stakePool, reserve, memeMint, name, symbol, uri,
}, pricing);
// After root initialization, submit plan.instructions together, signed by
// the payer and new mint. Then verify Stonk adoption and delivery separately.
const crank = settleWsol({ programId, payer, stakePool, reserve, memeMint });
```

No production program ID is hardcoded. Build-generated keypairs and binaries
remain ignored. The deployed upgrade authority would still be able to change
program behavior; immutable bindings describe this implementation, not a claim
that an upgradeable deployment is immutable.
