/** Unsigned builders only. No key loading, signing, or transaction submission. */
import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, NATIVE_MINT,
  getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction,
} from '@solana/spl-token';

export const SANCTUM = new PublicKey('SP12tWFxD9oJsVWNavTTBZvMbA6gkAmxtVgxdqvyvhY');
export const LAUNCHLAB = new PublicKey('LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj');
export const STONK_STANDARD = new PublicKey('4E876qZTE9FJMrBzgVtBrSrzz2TLivB5Y5QXPjB4gZL7');
export const STONK_SOL_CONFIG = new PublicKey('6s1xP3hpbAfFoNtUNF8mfHsjr2Bd97JxFJRWLbL6aHuX');
export const STONK_API = 'https://stonkfun.xyz/api/public/v1';
const key = value => new PublicKey(value);
const seed = value => Buffer.from(value);
const derive = (program, seeds) => PublicKey.findProgramAddressSync(seeds, key(program))[0];
const meta = (pubkey, isWritable = false, isSigner = false) => ({ pubkey: key(pubkey), isWritable, isSigner });
const instruction = (programId, tag, keys) => new TransactionInstruction({ programId: key(programId), data: Buffer.from([tag]), keys });

export function addresses({ programId, stakePool, memeMint }) {
  const root = derive(programId, [seed('creator'), key(stakePool).toBuffer()]);
  const mint = key(memeMint);
  const inbox = derive(programId, [seed('inbox'), root.toBuffer(), mint.toBuffer()]);
  return {
    root, inbox,
    launchPool: derive(LAUNCHLAB, [seed('pool'), mint.toBuffer(), NATIVE_MINT.toBuffer()]),
    wsolAta: getAssociatedTokenAddressSync(NATIVE_MINT, inbox, true),
    unwrap: derive(programId, [seed('unwrap'), inbox.toBuffer()]),
  };
}

export function initializeCreator({ programId, payer, manager, stakePool, reserve }) {
  const root = derive(programId, [seed('creator'), key(stakePool).toBuffer()]);
  return instruction(programId, 0, [meta(payer, true, true), meta(manager, false, true), meta(root, true), meta(stakePool), meta(reserve), meta(SystemProgram.programId)]);
}
export function registerStonk(params) {
  const { root, inbox, launchPool } = addresses(params);
  return instruction(params.programId, 1, [meta(params.payer, true, true), meta(root), meta(inbox, true), meta(params.memeMint), meta(launchPool), meta(SystemProgram.programId)]);
}
export function settleSol(params) {
  const { root, inbox } = addresses(params);
  return instruction(params.programId, 2, [meta(root, true), meta(inbox, true), meta(params.stakePool), meta(params.reserve, true)]);
}
export function settleWsol(params) {
  const { wsolAta, unwrap } = addresses(params);
  const sol = settleSol(params);
  return instruction(params.programId, 3, [...sol.keys, meta(params.payer, true, true), meta(wsolAta, true), meta(unwrap, true), meta(NATIVE_MINT), meta(TOKEN_PROGRAM_ID), meta(SystemProgram.programId)]);
}

export function decodeState(account, programId) {
  if (!account?.owner.equals(key(programId))) throw new Error('Inbox program owner mismatch');
  const d = Buffer.from(account.data);
  if (d.length !== 122 || d[8] !== 1) throw new Error('Unsupported inbox state');
  const tag = d.subarray(0, 8).toString('ascii');
  const contributedLamports = d.readBigUInt64LE(106) + (d.readBigUInt64LE(114) << 64n);
  const keys = [10, 42, 74].map(offset => new PublicKey(d.subarray(offset, offset + 32)));
  if (tag === 'OKCREATE') return { kind: 'creator', stakePool: keys[0], reserve: keys[1], lstMint: keys[2], contributedLamports };
  if (tag === 'OKINBOX1') return { kind: 'inbox', root: keys[0], memeMint: keys[1], launchPool: keys[2], contributedLamports };
  throw new Error('Unknown inbox state');
}

export async function fetchStonkSolPricing(fetcher = fetch) {
  const response = await fetcher(`${STONK_API}/launchlab/pricing?quoteMint=${NATIVE_MINT}`);
  if (!response.ok) throw new Error(`Stonk pricing HTTP ${response.status}`);
  return (await response.json()).data;
}
function u64(value) { const out = Buffer.alloc(8); out.writeBigUInt64LE(BigInt(value)); return out; }
function str(value, maximum, label) {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  const text = Buffer.from(value, 'utf8');
  if (!text.length || text.length > maximum) throw new Error(`${label} must be 1–${maximum} UTF-8 bytes`);
  const length = Buffer.alloc(4); length.writeUInt32LE(text.length); return Buffer.concat([length, text]);
}
function equal(a, b) { try { return key(a).equals(key(b)); } catch { return false; } }

/** LaunchLab create -> register attribution -> create persistent payout ATA.
 * The caller submits the returned instructions atomically and signs with payer
 * and the new mint. The inbox is a non-signing creator account in LaunchLab.
 * Initialize the master creator root separately with the stake-pool manager.
 */
export function buildStonkLaunch(params, pricing, now = Date.now()) {
  const c = pricing?.curve;
  const age = now - Date.parse(pricing?.prices?.observedAt);
  if (!Number.isFinite(age) || age < -30_000 || age > 120_000) throw new Error('Refresh Stonk pricing before building a launch');
  if (!equal(c?.programId, LAUNCHLAB) || !equal(c?.configId, STONK_SOL_CONFIG)
      || !equal(pricing?.platform?.standard, STONK_STANDARD)
      || !equal(pricing?.quote?.mint, NATIVE_MINT) || !equal(pricing?.quote?.tokenProgram, TOKEN_PROGRAM_ID)
      || pricing.quote.decimals !== 9 || c.baseDecimals !== 6 || c.curveType !== 'ConstantCurve'
      || c.migrateType !== 'cpmm' || c.supply !== '1000000000000000' || c.totalSellA !== '793100000000000'
      || BigInt(c.vesting?.totalLockedAmount ?? -1) !== 0n || BigInt(c.vesting?.cliffPeriod ?? -1) !== 0n
      || BigInt(c.vesting?.unlockPeriod ?? -1) !== 0n || ![0, 1, 2].includes(c.cpmmCreatorFeeOn)) {
    throw new Error('Stonk standard SOL launch shape changed; review integration');
  }
  const raised = BigInt(pricing.raise.raw);
  if (raised <= 0n || raised < BigInt(pricing.raise.minimumRaw)) throw new Error('Invalid raise');
  const curveRule = derive(LAUNCHLAB, [seed('platform_curve_rule'), STONK_STANDARD.toBuffer(), STONK_SOL_CONFIG.toBuffer()]);
  if (!equal(pricing.curveRule?.standard, curveRule)) throw new Error('Stonk curve-rule mismatch');
  if (params.mode && params.mode !== 'standard') throw new Error('This adapter supports standard creator fees only');
  const { root, inbox, launchPool, wsolAta } = addresses(params);
  const mint = key(params.memeMint);
  const vault = m => derive(LAUNCHLAB, [seed('pool_vault'), launchPool.toBuffer(), m.toBuffer()]);
  const data = Buffer.concat([
    Buffer.from([37, 190, 126, 222, 44, 154, 171, 17]), Buffer.from([6]),
    str(params.name, 32, 'name'), str(params.symbol, 10, 'symbol'), str(params.uri, 200, 'uri'),
    Buffer.from([0]), u64(c.supply), u64(c.totalSellA), u64(raised), Buffer.from([1]),
    u64(0), u64(0), u64(0), Buffer.from([c.cpmmCreatorFeeOn, 0]),
    // Match the vendored Raydium SDK's zero padding for an absent fee extension.
    Buffer.alloc(10),
  ]);
  const launch = new TransactionInstruction({ programId: LAUNCHLAB, data, keys: [
    meta(params.payer, true, true), meta(inbox), meta(STONK_SOL_CONFIG), meta(STONK_STANDARD),
    meta(derive(LAUNCHLAB, [seed('vault_auth_seed')])), meta(launchPool, true), meta(mint, true, true),
    meta(NATIVE_MINT), meta(vault(mint), true), meta(vault(NATIVE_MINT), true),
    meta(TOKEN_2022_PROGRAM_ID), meta(TOKEN_PROGRAM_ID), meta(SystemProgram.programId),
    meta(derive(LAUNCHLAB, [seed('__event_authority')])), meta(LAUNCHLAB), meta(curveRule),
  ] });
  return { root, inbox, launchPool, wsolAta, instructions: [
    launch, registerStonk(params),
    createAssociatedTokenAccountIdempotentInstruction(key(params.payer), wsolAta, inbox, NATIVE_MINT, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID),
  ] };
}
