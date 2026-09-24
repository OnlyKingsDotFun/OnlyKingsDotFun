// Exercise the patched Raydium CP-Swap (token collections + rebalance swap) against a fork that holds
// real mainnet pool state. Works on Surfpool (pass --write-program to hot-swap the CPMM bytecode) or on a
// solana-test-validator started with --upgradeable-program at the CPMM id and --clone'd accounts.
//   RPC_URL=http://127.0.0.1:8899 node scripts/raydium-fork-demo.mjs --write-program
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, NATIVE_MINT, createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction, getAccount, getAssociatedTokenAddressSync,
} from "@solana/spl-token";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const conn = new Connection(RPC, "confirmed");
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(process.env.KEYPAIR ?? `${homedir()}/.config/solana/id.json`, "utf8"))));
const CPMM = new PublicKey("CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C");
const PUMP = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const POOL = new PublicKey(process.env.POOL ?? "2higKRf25Q9WMcYfgyK96AAuFVv5zucfDAFHHDuVETcq"); // WSOL / 73ed…pump, graduated, non-mayhem
const MAYHEM_MINT = new PublicKey("DA2hWDYUaBxfhkvC3m3Gf65FYuGSojZw4DsYUDUxpump");   // mayhem-mode launch -> must be rejected
const disc = (name) => createHash("sha256").update(name).digest().subarray(0, 8);
const u8 = (v) => Buffer.from([v]); const u16 = (v) => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; };
const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; }; const u64 = (v) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return b; };
const w = (p, s = false) => ({ pubkey: p, isSigner: s, isWritable: true }); const r = (p) => ({ pubkey: p, isSigner: false, isWritable: false });
const pda = (seeds) => PublicKey.findProgramAddressSync(seeds, CPMM)[0];
const ix = (keys, data) => new TransactionInstruction({ programId: CPMM, keys, data });
const rpc = async (method, params) => { const res = await (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json(); if (res.error) throw new Error(`${method}: ${JSON.stringify(res.error)}`); return res.result; };

async function send(label, instructions, { expectFail } = {}) {
  const tx = new Transaction().add(...instructions);
  try {
    const sig = await sendAndConfirmTransaction(conn, tx, [payer], { commitment: "confirmed" });
    if (expectFail) throw new Error(`${label}: expected failure but succeeded (${sig})`);
    const t = await conn.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    console.log(`✔ ${label}  ${t?.meta?.computeUnitsConsumed ?? "?"} CU`);
    return t;
  } catch (e) {
    if (expectFail) {
      const m = String(e.message);
      const code = m.match(/custom program error: (0x[0-9a-f]+)/i)?.[1] ?? m.match(/Custom":(\d+)/)?.[1];
      console.log(`✔ ${label} rejected as expected${code ? ` (${code})` : ""}`);
      return null;
    }
    throw e;
  }
}
// SwapEvent: disc | pool 32 | in_before u64 | out_before u64 | in u64 | out u64 | in_tf u64 | out_tf u64 | base_input u8 | in_mint 32 | out_mint 32 | trade_fee u64 | creator_fee u64 | creator_on_input u8
function swapEvent(t) {
  for (const l of t?.meta?.logMessages ?? []) {
    if (!l.startsWith("Program data: ")) continue;
    const d = Buffer.from(l.slice(14), "base64");
    if (!d.subarray(0, 8).equals(disc("event:SwapEvent"))) continue;
    return { input: d.readBigUInt64LE(56), output: d.readBigUInt64LE(64), tradeFee: d.readBigUInt64LE(153) };
  }
}

// --- 0. program + pool state ---
if (process.argv.includes("--write-program")) {
  const so = readFileSync("upstream/raydium-cp-swap/target/deploy/raydium_cp_swap.so");
  await rpc("surfnet_writeProgram", [CPMM.toBase58(), so.toString("hex"), 0, payer.publicKey.toBase58()]);
  console.log(`✔ surfnet_writeProgram: patched CP-Swap (${so.length} bytes) now lives at ${CPMM.toBase58()}`);
}
const pool = (await conn.getAccountInfo(POOL)).data;
const pk = (o) => new PublicKey(pool.subarray(o, o + 32));
const P = { ammConfig: pk(8), vault0: pk(72), vault1: pk(104), mint0: pk(168), mint1: pk(200), tp0: pk(232), tp1: pk(264), observation: pk(296), dec0: pool[331], dec1: pool[332] };
const authority = pda([Buffer.from("vault_and_lp_mint_auth_seed")]);
const cfg = (await conn.getAccountInfo(P.ammConfig)).data;
const tradeFeeRate = cfg.readBigUInt64LE(12);
console.log(`pool ${POOL.toBase58()}\n  token_0 ${P.mint0.toBase58()} (${P.dec0} dec)\n  token_1 ${P.mint1.toBase58()} (${P.dec1} dec, ${P.tp1.equals(TOKEN_2022_PROGRAM_ID) ? "Token-2022" : "SPL"})\n  trade_fee_rate ${tradeFeeRate} ppm`);
const vaultAmt = async (v) => (await getAccount(conn, v, "confirmed", P.tp0.equals(TOKEN_PROGRAM_ID) && v.equals(P.vault0) ? TOKEN_PROGRAM_ID : (v.equals(P.vault1) ? P.tp1 : P.tp0))).amount;

// --- 1. fund payer: wrap SOL, mint pump token via cheatcode ---
const ata0 = getAssociatedTokenAddressSync(P.mint0, payer.publicKey, false, P.tp0);
const ata1 = getAssociatedTokenAddressSync(P.mint1, payer.publicKey, false, P.tp1);
await send("wrap 50 SOL", [
  createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, ata0, payer.publicKey, P.mint0, P.tp0),
  SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: ata0, lamports: 50n * 10n ** 9n }),
  createSyncNativeInstruction(ata0, P.tp0),
  createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, ata1, payer.publicKey, P.mint1, P.tp1),
]);
const wantPump = 5_000_000n * 10n ** BigInt(P.dec1);
await rpc("surfnet_setTokenAccount", [payer.publicKey.toBase58(), P.mint1.toBase58(), { amount: Number(wantPump) }, P.tp1.toBase58()]).catch(async (e) => {
  // solana-test-validator has no cheatcodes: expect the account to have been --clone'd/pre-funded instead
  console.log(`  (no cheatcode: ${String(e.message).slice(0, 60)}… using existing balance)`);
});
console.log(`  payer WSOL ${await getAccount(conn, ata0).then((a) => a.amount)} · pump ${await getAccount(conn, ata1, "confirmed", P.tp1).then((a) => a.amount)}`);

// --- 2. ruleset (admin) -> collection (permissionless) -> members (permissionless, rule-checked) ---
const rulesetIndex = 1; // kind 1 = PumpFunLaunch, flags 0 = non-mayhem only, program = pump.fun
const ruleset = pda([Buffer.from("ruleset"), u16(rulesetIndex)]);
if (!(await conn.getAccountInfo(ruleset))) {
  await send("create_ruleset(PumpFunLaunch, non-mayhem, pump.fun)  [admin]", [ix([w(payer.publicKey, true), w(ruleset), r(SystemProgram.programId)], Buffer.concat([disc("global:create_ruleset"), u16(rulesetIndex), u8(1), u8(0), PUMP.toBuffer()]))]);
} else console.log("✔ ruleset exists");
const collIndex = Math.floor(Math.random() * 65535);
const collection = pda([Buffer.from("token_collection"), payer.publicKey.toBuffer(), u16(collIndex)]);
await send(`create_token_collection(quote=WSOL, fee/100)  [permissionless]`, [ix([w(payer.publicKey, true), r(ruleset), r(NATIVE_MINT), w(collection), r(SystemProgram.programId)], Buffer.concat([disc("global:create_token_collection"), u16(collIndex), u32(100)]))]);
const member = (mint) => pda([Buffer.from("collection_member"), collection.toBuffer(), mint.toBuffer()]);
const curve = (mint) => PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), mint.toBuffer()], PUMP)[0];
const regIx = (mint, proof) => ix([w(payer.publicKey, true), w(collection), r(ruleset), r(mint), w(member(mint)), r(SystemProgram.programId), ...proof.map(r)], disc("global:register_collection_member"));
await send("register WSOL (quote mint, no rule check)", [regIx(P.mint0, [])]);
await send(`register ${P.mint1.toBase58().slice(0, 8)}…pump with its bonding curve as proof`, [regIx(P.mint1, [curve(P.mint1)])]);
await send("register mayhem-mode pump coin -> RuleCheckFailed", [regIx(MAYHEM_MINT, [curve(MAYHEM_MINT)])], { expectFail: true });
await send("register pump coin with the WRONG bonding curve -> RuleCheckFailed", [regIx(new PublicKey("7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr"), [curve(P.mint1)])], { expectFail: true });

// --- 3. standard swap vs rebalance swap on the live pool ---
const swapKeys = (inMint, outMint) => {
  const zeroForOne = inMint.equals(P.mint0);
  return [w(payer.publicKey, true), r(authority), r(P.ammConfig), w(POOL), w(zeroForOne ? ata0 : ata1), w(zeroForOne ? ata1 : ata0), w(zeroForOne ? P.vault0 : P.vault1), w(zeroForOne ? P.vault1 : P.vault0), r(zeroForOne ? P.tp0 : P.tp1), r(zeroForOne ? P.tp1 : P.tp0), r(inMint), r(outMint), w(P.observation)];
};
const swapIx = (inMint, outMint, amt) => ix(swapKeys(inMint, outMint), Buffer.concat([disc("global:swap_base_input"), u64(amt), u64(0)]));
const rebalIx = (inMint, outMint, amt) => ix([...swapKeys(inMint, outMint), r(collection), r(member(inMint)), r(member(outMint))], Buffer.concat([disc("global:rebalance_swap_base_input"), u64(amt), u64(0)]));
const v0 = await vaultAmt(P.vault0), v1 = await vaultAmt(P.vault1);
console.log(`\nvaults before: ${Number(v0) / 1e9} WSOL / ${Number(v1) / 10 ** P.dec1} pump`);
// Rates: WSOL 1.0; mark the pump coin at the pool's current price so the pool starts "balanced".
const pumpRate = (BigInt(v0) * 10n ** BigInt(P.dec1) * 1_000_000_000n) / (BigInt(v1) * 10n ** 9n);
await send(`set_collection_member_rate(pump, ${pumpRate}) = current pool price -> pool is balanced`, [ix([w(payer.publicKey, true), r(collection), w(member(P.mint1))], Buffer.concat([disc("global:set_collection_member_rate"), u64(pumpRate)]))]);
await send("rebalance swap on a balanced pool -> NotRebalancing", [rebalIx(P.mint0, P.mint1, 10n ** 9n)], { expectFail: true });
const t1 = await send("swap_base_input 20 WSOL -> pump (standard fee)", [swapIx(P.mint0, P.mint1, 20n * 10n ** 9n)]);
const e1 = swapEvent(t1);
console.log(`  in ${e1.input} out ${e1.output} trade_fee ${e1.tradeFee} (${(Number(e1.tradeFee) * 1e6 / Number(e1.input)).toFixed(1)} ppm)`);
await send("rebalance swap WSOL -> pump (same direction, pushes further off) -> NotRebalancing", [rebalIx(P.mint0, P.mint1, 10n ** 9n)], { expectFail: true });
const t2 = await send(`rebalance_swap_base_input ${Number(e1.output) / 2 / 10 ** P.dec1} pump -> WSOL (fee/100)`, [rebalIx(P.mint1, P.mint0, e1.output / 2n)]);
const e2 = swapEvent(t2);
console.log(`  in ${e2.input} out ${e2.output} trade_fee ${e2.tradeFee} (${(Number(e2.tradeFee) * 1e6 / Number(e2.input)).toFixed(1)} ppm)`);
await send("rebalance swap overshooting the balance point -> NotRebalancing", [rebalIx(P.mint1, P.mint0, e1.output * 3n)], { expectFail: true });
console.log(`vaults after:  ${Number(await vaultAmt(P.vault0)) / 1e9} WSOL / ${Number(await vaultAmt(P.vault1)) / 10 ** P.dec1} pump`);
console.log(`\ncollection ${collection.toBase58()}\nruleset    ${ruleset.toBase58()}`);
