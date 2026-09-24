// The whole collection lifecycle in ONE transaction v1 (SIMD-0385, 4,096-byte limit) using @solana/kit 8.
// Target: an Agave 4.3 validator (txv1 active) with the patched CP-Swap at the CPMM id and the live pool cloned.
//   RPC_URL=http://127.0.0.1:8999 WS_URL=ws://127.0.0.1:9000 node scripts/raydium-v1-tx-demo.mjs
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import {
  AccountRole, address, appendTransactionMessageInstructions, createKeyPairSignerFromBytes, createSolanaRpc,
  createSolanaRpcSubscriptions, createTransactionMessage, getBase64EncodedWireTransaction, getProgramDerivedAddress,
  getSignatureFromTransaction, pipe, sendAndConfirmTransactionFactory, setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash, signTransactionMessageWithSigners, getAddressEncoder,
  setTransactionMessageComputeUnitLimit, setTransactionMessageLoadedAccountsDataSizeLimit,
} from "@solana/kit";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8999", WS = process.env.WS_URL ?? "ws://127.0.0.1:9000";
const rpc = createSolanaRpc(RPC), subs = createSolanaRpcSubscriptions(WS);
const signer = await createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`, "utf8"))));
const CPMM = "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C", PUMP = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P", SYS = "11111111111111111111111111111111";
const POOL = "2higKRf25Q9WMcYfgyK96AAuFVv5zucfDAFHHDuVETcq";
const disc = (n) => createHash("sha256").update(n).digest().subarray(0, 8);
const u16 = (v) => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; }; const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; };
const u64 = (v) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return b; };
const enc = getAddressEncoder();
const pda = async (seeds, program = CPMM) => (await getProgramDerivedAddress({ programAddress: address(program), seeds }))[0];
const W = (a) => ({ address: address(a), role: AccountRole.WRITABLE }), R = (a) => ({ address: address(a), role: AccountRole.READONLY });
const S = { address: signer.address, role: AccountRole.WRITABLE_SIGNER, signer };
const ix = (accounts, data) => ({ programAddress: address(CPMM), accounts, data: new Uint8Array(data) });

const pool = Buffer.from((await rpc.getAccountInfo(address(POOL), { encoding: "base64" }).send()).value.data[0], "base64");
const pk = (o) => new PublicKey(pool.subarray(o, o + 32)).toBase58();
const P = { cfg: pk(8), vault0: pk(72), vault1: pk(104), mint0: pk(168), mint1: pk(200), tp0: pk(232), tp1: pk(264), obs: pk(296), dec1: pool[332] };
const bal = async (k) => BigInt(Buffer.from((await rpc.getAccountInfo(address(k), { encoding: "base64" }).send()).value.data[0], "base64").readBigUInt64LE(64));
const vault0Amt = await bal(P.vault0), vault1Amt = await bal(P.vault1);
const owner = new PublicKey(signer.address);
const ata0 = getAssociatedTokenAddressSync(new PublicKey(P.mint0), owner).toBase58();
const ata1 = getAssociatedTokenAddressSync(new PublicKey(P.mint1), owner, false, TOKEN_2022_PROGRAM_ID).toBase58();
const authority = await pda(["vault_and_lp_mint_auth_seed"]);
const ruleset = await pda(["ruleset", u16(1)]);
const curve = await pda(["bonding-curve", enc.encode(address(P.mint1))], PUMP);

// offline CPMM math (Raydium fee on input, ceil): predicts the swap output so the rebalance legs can be sized in the same tx
const feeRate = 2500n, swapIn = 20n * 10n ** 9n;
const fee = (swapIn * feeRate + 999_999n) / 1_000_000n, net = swapIn - fee;
const out = (vault1Amt * net) / (vault0Amt + net);
const pumpRate = (vault0Amt * 10n ** BigInt(P.dec1) * 1_000_000_000n) / (vault1Amt * 10n ** 9n);
const swapKeys = (zeroForOne) => [S, R(authority), R(P.cfg), W(POOL), W(zeroForOne ? ata0 : ata1), W(zeroForOne ? ata1 : ata0), W(zeroForOne ? P.vault0 : P.vault1), W(zeroForOne ? P.vault1 : P.vault0), R(zeroForOne ? P.tp0 : P.tp1), R(zeroForOne ? P.tp1 : P.tp0), R(zeroForOne ? P.mint0 : P.mint1), R(zeroForOne ? P.mint1 : P.mint0), W(P.obs)];

// Three collections on the same pool with different rebalance discounts (fee/100, fee/500, fee/1000):
// create + register WSOL + register pump (bonding-curve proof) + mark rate, then one standard swap to skew the
// pool, then one rebalance leg through each collection. 21 instructions, one atomic transaction.
const instructions = [];
const collections = [];
for (const divisor of [100, 500, 1000]) {
  const idx = Math.floor(Math.random() * 65535);
  const collection = await pda(["token_collection", enc.encode(signer.address), u16(idx)]);
  const member = async (m) => pda(["collection_member", enc.encode(address(collection)), enc.encode(address(m))]);
  const [m0, m1] = [await member(P.mint0), await member(P.mint1)];
  collections.push({ collection, m0, m1, divisor });
  instructions.push(
    ix([S, R(ruleset), R(P.mint0), W(collection), R(SYS)], Buffer.concat([disc("global:create_token_collection"), u16(idx), u32(divisor)])),
    ix([S, W(collection), R(ruleset), R(P.mint0), W(m0), R(SYS)], disc("global:register_collection_member")),
    ix([S, W(collection), R(ruleset), R(P.mint1), W(m1), R(SYS), R(curve)], disc("global:register_collection_member")),
    ix([S, R(collection), W(m1)], Buffer.concat([disc("global:set_collection_member_rate"), u64(pumpRate)])),
  );
}
instructions.push(ix(swapKeys(true), Buffer.concat([disc("global:swap_base_input"), u64(swapIn), u64(0)])));
let remainingOut = out;
for (const c of collections) {
  const leg = remainingOut / 2n; remainingOut -= leg;
  instructions.push(ix([...swapKeys(false), R(c.collection), R(c.m1), R(c.m0)], Buffer.concat([disc("global:rebalance_swap_base_input"), u64(leg), u64(0)])));
}
const { value: bh } = await rpc.getLatestBlockhash().send();
const build = (version) => pipe(createTransactionMessage({ version }), (m) => setTransactionMessageFeePayerSigner(signer, m), (m) => setTransactionMessageLifetimeUsingBlockhash(bh, m), (m) => appendTransactionMessageInstructions(instructions, m), (m) => (version === 1 ? setTransactionMessageLoadedAccountsDataSizeLimit(8_000_000, setTransactionMessageComputeUnitLimit(1_400_000, m)) : m));
const v1 = await signTransactionMessageWithSigners(build(1));
const wire = getBase64EncodedWireTransaction(v1);
const bytes = Buffer.from(wire, "base64").length;
console.log(`v1 transaction: ${instructions.length} instructions, ${new Set(instructions.flatMap((i) => i.accounts.map((a) => a.address))).size + 1} unique accounts, ${bytes} bytes (v0 limit 1232, v1 limit 4096), version byte 0x${Buffer.from(wire, "base64")[0].toString(16)}`);
try {
  const v0tx = await signTransactionMessageWithSigners(build(0));
  const v0bytes = Buffer.from(getBase64EncodedWireTransaction(v0tx), "base64").length;
  console.log(`same message as v0: ${v0bytes} bytes -> ${v0bytes > 1232 ? "over the 1232-byte limit, would need lookup tables or 2+ transactions" : "fits"}`);
  if (v0bytes > 1232) { try { await rpc.sendTransaction(getBase64EncodedWireTransaction(v0tx), { encoding: "base64" }).send(); console.log("  (unexpectedly accepted)"); } catch (e) { console.log(`  RPC rejects the v0 form: ${String(e.cause?.message ?? e.message).split("\n")[0].slice(0, 100)}`); } }
} catch (e) { console.log(`same message as v0: cannot be compiled (${String(e.message).split("\n")[0].slice(0, 90)})`); }
await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions: subs })(v1, { commitment: "confirmed" });
const sig = getSignatureFromTransaction(v1);
const tx = await rpc.getTransaction(sig, { maxSupportedTransactionVersion: 1, encoding: "json" }).send();
console.log(`✔ landed ${sig}\n  version ${tx.version}  CU ${tx.meta.computeUnitsConsumed}  err ${tx.meta.err}`);
for (const l of tx.meta.logMessages.filter((l) => /Instruction:|Error/.test(l))) console.log("  " + l.replace("Program log: ", ""));
console.log(`  vaults now ${Number(await bal(P.vault0)) / 1e9} WSOL / ${Number(await bal(P.vault1)) / 10 ** P.dec1} pump`);
