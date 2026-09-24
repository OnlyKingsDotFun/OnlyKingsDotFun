import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PublicKey, Transaction } from '@solana/web3.js';
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { addresses, buildStonkLaunch, decodeState, settleSol, settleWsol, LAUNCHLAB, STONK_SOL_CONFIG, STONK_STANDARD } from './creator-inbox.mjs';

const pub = n => new PublicKey(new Uint8Array(32).fill(n));
const params = { programId: pub(17), payer: pub(21), stakePool: pub(25), reserve: pub(27), memeMint: pub(26), name: 'Community meme', symbol: 'MEME', uri: 'https://example.com/metadata.json' };
const now = Date.parse('2026-09-24T06:13:40Z');
const curveRule = PublicKey.findProgramAddressSync([Buffer.from('platform_curve_rule'), STONK_STANDARD.toBuffer(), STONK_SOL_CONFIG.toBuffer()], LAUNCHLAB)[0];
const pricing = {
  quote: { mint: NATIVE_MINT.toBase58(), tokenProgram: TOKEN_PROGRAM_ID.toBase58(), decimals: 9 },
  raise: { raw: '85000000000', minimumRaw: '24000000000' },
  prices: { observedAt: new Date(now).toISOString() },
  curve: { programId: LAUNCHLAB.toBase58(), configId: STONK_SOL_CONFIG.toBase58(), baseDecimals: 6, curveType: 'ConstantCurve', migrateType: 'cpmm', supply: '1000000000000000', totalSellA: '793100000000000', vesting: { totalLockedAmount: '0', cliffPeriod: '0', unlockPeriod: '0' }, cpmmCreatorFeeOn: 0 },
  platform: { standard: STONK_STANDARD.toBase58() }, curveRule: { standard: curveRule.toBase58() },
};

test('launch, registration and payout address all bind to the same inbox', () => {
  const plan = buildStonkLaunch(params, pricing, now);
  const [launch, register, ata] = plan.instructions;
  assert(launch.keys[1].pubkey.equals(plan.inbox));
  assert.equal(launch.keys[1].isSigner, false);
  assert(register.keys[2].pubkey.equals(plan.inbox));
  assert(ata.keys[2].pubkey.equals(plan.inbox));
  assert(launch.keys.at(-1).pubkey.equals(curveRule));
  assert.equal(launch.data.at(-11), 0); // None: no transfer-fee extension
  assert.equal(launch.keys.filter(k => k.isSigner).length, 2);
  const tx = new Transaction({ feePayer: params.payer, recentBlockhash: pub(99).toBase58() }).add(...plan.instructions);
  assert(tx.serialize({ requireAllSignatures: false, verifySignatures: false }).length <= 1232);
});

test('adapter refuses reward mode, changed platform and stale pricing', () => {
  assert.throws(() => buildStonkLaunch({ ...params, mode: 'reward' }, pricing, now), /standard/);
  assert.throws(() => buildStonkLaunch(params, pricing, now + 121_000), /Refresh/);
  assert.throws(() => buildStonkLaunch(params, { ...pricing, platform: { standard: pub(99).toBase58() } }, now), /shape changed/);
  assert.throws(() => buildStonkLaunch(params, { ...pricing, curveRule: { standard: pub(99).toBase58() } }, now), /curve-rule/);
});

test('settlement builders carry no caller-selected withdrawal beneficiary', () => {
  const a = addresses(params); const native = settleSol(params); const wrapped = settleWsol(params);
  assert.equal(native.keys.length, 4); assert.equal(wrapped.keys.length, 10);
  assert(native.keys.every(k => !k.isSigner));
  assert(native.keys[3].pubkey.equals(params.reserve));
  assert(wrapped.keys[5].pubkey.equals(a.wsolAta));
  assert(wrapped.keys[6].pubkey.equals(a.unwrap));
  assert.equal(wrapped.keys[4].isSigner, true);
});

test('u128 counters decode losslessly and reject foreign state', () => {
  const data = Buffer.alloc(122); data.write('OKINBOX1'); data[8] = 1;
  data.writeBigUInt64LE(7n, 106); data.writeBigUInt64LE(2n, 114);
  assert.equal(decodeState({ owner: params.programId, data }, params.programId).contributedLamports, (2n << 64n) + 7n);
  assert.throws(() => decodeState({ owner: pub(99), data }, params.programId), /owner/);
});
