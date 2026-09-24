// CLMM rebalance_swap_v2 against the live WSOL/USDC Raydium CLMM pool inside a Surfpool mainnet fork.
// Requires the patched CLMM bytecode (collections + rebalance_swap_v2) to be live in the fork.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, NATIVE_MINT, createAssociatedTokenAccountIdempotentInstruction, createSyncNativeInstruction, getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const conn = new Connection(RPC, "confirmed");
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`, "utf8"))));
const CLMM = new PublicKey("CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK");
const MEMO = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const POOL = new PublicKey(process.env.CLMM_POOL ?? "3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv");
const disc = (n) => createHash("sha256").update(n).digest().subarray(0, 8);
const u8 = (v) => Buffer.from([v]); const u16 = (v) => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; };
const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; }; const u64 = (v) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return b; };
const u128 = (v) => { const b = Buffer.alloc(16); b.writeBigUInt64LE(BigInt(v) & ((1n << 64n) - 1n)); b.writeBigUInt64LE(BigInt(v) >> 64n, 8); return b; };
const i32be = (v) => { const b = Buffer.alloc(4); b.writeInt32BE(v); return b; };
const w = (p, s = false) => ({ pubkey: p, isSigner: s, isWritable: true }); const r = (p) => ({ pubkey: p, isSigner: false, isWritable: false });
const rpc = async (m, p) => { const j = await (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) })).json(); if (j.error) throw new Error(JSON.stringify(j.error)); return j.result; };
async function send(label, ixs, { expectFail } = {}) {
  try {
    const sig = await sendAndConfirmTransaction(conn, new Transaction().add(...ixs), [payer], { commitment: "confirmed" });
    if (expectFail) throw new Error(`${label}: expected failure`);
    const t = await conn.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    console.log(`✔ ${label}  ${t?.meta?.computeUnitsConsumed} CU`); return t;
  } catch (e) {
    if (expectFail) { const code = String(e.message).match(/custom program error: (0x[0-9a-f]+)/i)?.[1]; console.log(`✔ ${label} rejected as expected${code ? ` (${code})` : ""}`); return null; }
    throw e;
  }
}
const readPool = async () => {
  const d = (await conn.getAccountInfo(POOL)).data; const pk = (o) => new PublicKey(d.subarray(o, o + 32));
  const u128r = (o) => d.readBigUInt64LE(o) + (d.readBigUInt64LE(o + 8) << 64n);
  return { cfg: pk(9), mint0: pk(73), mint1: pk(105), vault0: pk(137), vault1: pk(169), obs: pk(201), dec0: d[233], dec1: d[234], spacing: d.readUInt16LE(235), liquidity: u128r(237), sqrt: u128r(253), tick: d.readInt32LE(269), pf0: d.readBigUInt64LE(309), pf1: d.readBigUInt64LE(317) };
};
let P = await readPool();
const cfg = (await conn.getAccountInfo(P.cfg)).data; // AmmConfig: 8 disc | bump 1 | index 2 | owner 32 | protocol_fee_rate u32 @43 | trade_fee_rate u32 @47 | tick_spacing u16 | fund_fee_rate u32
const tradeFeeRate = cfg.readUInt32LE(47), protocolFeeRate = cfg.readUInt32LE(43);
const price = (sqrt) => (Number(sqrt) / 2 ** 64) ** 2 * 10 ** (P.dec0 - P.dec1);
console.log(`CLMM pool ${POOL.toBase58()}  WSOL/USDC  spacing ${P.spacing}  price ${price(P.sqrt).toFixed(3)} USDC/SOL  trade_fee_rate ${tradeFeeRate} ppm  protocol share ${protocolFeeRate} ppm`);

// fund payer
const ata0 = getAssociatedTokenAddressSync(P.mint0, payer.publicKey), ata1 = getAssociatedTokenAddressSync(P.mint1, payer.publicKey);
await send("wrap 100 SOL", [createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, ata0, payer.publicKey, P.mint0), SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: ata0, lamports: 100n * 10n ** 9n }), createSyncNativeInstruction(ata0), createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, ata1, payer.publicKey, P.mint1)]);
await rpc("surfnet_setTokenAccount", [payer.publicKey.toBase58(), P.mint1.toBase58(), { amount: 50_000 * 1e6 }, TOKEN_PROGRAM_ID.toBase58()]).catch(() => console.log("  (no cheatcode on this validator: USDC for the rebalance leg comes from the standard swap)"));

// collection in CLMM itself: ruleset 0 = Any (admin), collection quote WSOL, members WSOL + USDC
const cp = (keys, data) => new TransactionInstruction({ programId: CLMM, keys, data });
const cpda = (seeds) => PublicKey.findProgramAddressSync(seeds, CLMM)[0];
const ruleset = cpda([Buffer.from("ruleset"), u16(0)]);
if (!(await conn.getAccountInfo(ruleset))) await send("create_ruleset(Any)  [admin]", [cp([w(payer.publicKey, true), w(ruleset), r(SystemProgram.programId)], Buffer.concat([disc("global:create_ruleset"), u16(0), u8(0), u8(0), PublicKey.default.toBuffer()]))]);
const idx = Math.floor(Math.random() * 65535);
const collection = cpda([Buffer.from("token_collection"), payer.publicKey.toBuffer(), u16(idx)]);
const member = (m) => cpda([Buffer.from("collection_member"), collection.toBuffer(), m.toBuffer()]);
await send("create_token_collection(quote=WSOL, fee/100) + register WSOL, USDC", [
  cp([w(payer.publicKey, true), r(ruleset), r(NATIVE_MINT), w(collection), r(SystemProgram.programId)], Buffer.concat([disc("global:create_token_collection"), u16(idx), u32(100)])),
  cp([w(payer.publicKey, true), w(collection), r(ruleset), r(P.mint0), w(member(P.mint0)), r(SystemProgram.programId)], disc("global:register_collection_member")),
  cp([w(payer.publicKey, true), w(collection), r(ruleset), r(P.mint1), w(member(P.mint1)), r(SystemProgram.programId)], disc("global:register_collection_member")),
]);
// USDC rate so that the target equals the current price: price_raw = (rate0/rate1) * 10^(dec1-dec0) => rate1 = 1e9 * 10^(dec1-dec0) / price_raw
const priceRaw = (Number(P.sqrt) / 2 ** 64) ** 2;
const usdcRate = BigInt(Math.round(1e9 * 10 ** (P.dec1 - P.dec0) / priceRaw));
await send(`set_collection_member_rate(USDC, ${usdcRate}) -> target = current price`, [cp([w(payer.publicKey, true), r(collection), w(member(P.mint1))], Buffer.concat([disc("global:set_collection_member_rate"), u64(usdcRate)]))]);

// tick arrays around the current tick
const ticksPerArray = P.spacing * 60;
const startIdx = (tick) => Math.floor(tick / ticksPerArray) * ticksPerArray;
const tickArray = (start) => PublicKey.findProgramAddressSync([Buffer.from("tick_array"), POOL.toBuffer(), i32be(start)], CLMM)[0];
const bitmapExt = PublicKey.findProgramAddressSync([Buffer.from("pool_tick_array_bitmap_extension"), POOL.toBuffer()], CLMM)[0];
async function remaining(zeroForOne) {
  const s = startIdx(P.tick); const dir = zeroForOne ? -1 : 1;
  const cands = [s, s + dir * ticksPerArray, s + 2 * dir * ticksPerArray, s + 3 * dir * ticksPerArray].map(tickArray);
  const infos = await conn.getMultipleAccountsInfo([bitmapExt, ...cands]);
  const out = []; if (infos[0]) out.push(w(bitmapExt));
  cands.forEach((k, i) => { if (infos[i + 1]) out.push(w(k)); });
  return out;
}
const swapKeys = (zeroForOne) => [w(payer.publicKey, true), r(P.cfg), w(POOL), w(zeroForOne ? ata0 : ata1), w(zeroForOne ? ata1 : ata0), w(zeroForOne ? P.vault0 : P.vault1), w(zeroForOne ? P.vault1 : P.vault0), w(P.obs), r(TOKEN_PROGRAM_ID), r(TOKEN_2022_PROGRAM_ID), r(MEMO), r(zeroForOne ? P.mint0 : P.mint1), r(zeroForOne ? P.mint1 : P.mint0)];
const args = (amount) => Buffer.concat([u64(amount), u64(0), u128(0), u8(1)]);
const swapV2 = async (zeroForOne, amount) => new TransactionInstruction({ programId: CLMM, keys: [...swapKeys(zeroForOne), ...(await remaining(zeroForOne))], data: Buffer.concat([disc("global:swap_v2"), args(amount)]) });
const rebalV2 = async (zeroForOne, amount) => new TransactionInstruction({ programId: CLMM, keys: [...swapKeys(zeroForOne), r(collection), r(member(zeroForOne ? P.mint0 : P.mint1)), r(member(zeroForOne ? P.mint1 : P.mint0)), ...(await remaining(zeroForOne))], data: Buffer.concat([disc("global:rebalance_swap_v2"), args(amount)]) });

await send("rebalance_swap_v2 on a balanced pool -> NotRebalancing", [await rebalV2(true, 10n ** 9n)], { expectFail: true });
let before = P;
await send("swap_v2 30 WSOL -> USDC (standard fee)", [await swapV2(true, 30n * 10n ** 9n)]);
P = await readPool();
const pf0a = P.pf0 - before.pf0;
console.log(`  price ${price(before.sqrt).toFixed(3)} -> ${price(P.sqrt).toFixed(3)} · protocol fee on WSOL ${pf0a} => LP fee ≈ ${(Number(pf0a) * 1e6 / protocolFeeRate * 1e6 / 30e9).toFixed(0)} ppm of input`);
await send("rebalance_swap_v2 WSOL -> USDC (same direction) -> NotRebalancing", [await rebalV2(true, 10n ** 9n)], { expectFail: true });
before = P;
const usdcIn = 1_500n * 10n ** 6n;
await send(`rebalance_swap_v2 ${usdcIn / 10n ** 6n} USDC -> WSOL (fee/100, toward target)`, [await rebalV2(false, usdcIn)]);
P = await readPool();
const pf1a = P.pf1 - before.pf1;
console.log(`  price ${price(before.sqrt).toFixed(3)} -> ${price(P.sqrt).toFixed(3)} · protocol fee on USDC ${pf1a} => LP fee ≈ ${(Number(pf1a) * 1e6 / protocolFeeRate * 1e6 / Number(usdcIn)).toFixed(0)} ppm of input`);
await send("rebalance_swap_v2 overshooting past target -> NotRebalancing", [await rebalV2(false, 40_000n * 10n ** 6n)], { expectFail: true });
console.log(`collection ${collection.toBase58()}`);
