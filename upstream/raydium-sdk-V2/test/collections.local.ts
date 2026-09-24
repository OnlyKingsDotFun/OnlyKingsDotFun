/**
 * Live test of raydium.collections against a local validator that carries our forks (see
 * ~/collection-amm/scripts/testnet-e2e.mjs for the validator setup). Creates two SPL mints, a cp-swap
 * pair, a collection on an ImmutableMint ruleset, binds the pair, adds a member, seeds it, quotes and
 * executes an intra swap via the SDK, and checks the quote against the on-chain event.
 *   npx ts-node -r tsconfig-paths/register test/collections.local.ts
 */
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { createMint, createAssociatedTokenAccountIdempotent, mintTo, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, transfer, getAccount, setAuthority, AuthorityType, NATIVE_MINT, createSyncNativeInstruction } from "@solana/spl-token";
import BN from "bn.js";
import { readFileSync } from "fs";
import { homedir } from "os";
import { Raydium, TxVersion, getIsotopeProgramIds, getPdaRuleset, makeCreateRulesetInstruction, RuleKind, getCpmmPdaAmmConfigId, getPdaPoolAuthority, getCreatePoolKeys, makeCreateCpmmPoolInInstruction, getPdaMemberVault } from "../src";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8999";
const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(`${homedir()}/test.json`, "utf8"))));
const conn = new Connection(RPC, "confirmed");
const CP = getIsotopeProgramIds().CPMM_PROGRAM;
const u16 = (v: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; };
const u64 = (v: bigint | number) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return b; };
const disc = (n: string) => require("crypto").createHash("sha256").update(n).digest().subarray(0, 8);
const ok = (label: string, cond: boolean, extra = "") => { console.log(`${cond ? "✔" : "✘"} ${label} ${extra}`); if (!cond) process.exit(1); };

async function main() {
  const raydium = await Raydium.load({ connection: conn, owner: admin, cluster: "devnet", disableFeatureCheck: true, disableLoadToken: true });
  // --- mints: A (quote-ish), B and C immutable
  const [A, B, C] = await Promise.all([createMint(conn, admin, admin.publicKey, null, 6), createMint(conn, admin, admin.publicKey, null, 6), createMint(conn, admin, admin.publicKey, null, 6)]);
  const SIX = 1_000_000;
const supply = BigInt(100_000_000) * BigInt(SIX);
  const atas: Record<string, PublicKey> = {};
  for (const m of [A, B, C]) { atas[m.toBase58()] = await createAssociatedTokenAccountIdempotent(conn, admin, m, admin.publicKey); await mintTo(conn, admin, m, atas[m.toBase58()], admin, supply); }
  await setAuthority(conn, admin, B, admin, AuthorityType.MintTokens, null);
  await setAuthority(conn, admin, C, admin, AuthorityType.MintTokens, null);
  console.log("mints", A.toBase58(), B.toBase58(), C.toBase58());

  // --- cp-swap config + pool A/B (admin-gated on the fork: create_pool_fee receiver is admin's WSOL ATA)
  const cfgIndex = Math.floor(Math.random() * 60000) + 1;
  const cfgId = getCpmmPdaAmmConfigId(CP, cfgIndex).publicKey;
  const cfgIx = { programId: CP, keys: [{ pubkey: admin.publicKey, isSigner: true, isWritable: true }, { pubkey: cfgId, isSigner: false, isWritable: true }, { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }], data: Buffer.concat([disc("global:create_amm_config"), u16(cfgIndex), u64(2500), u64(120000), u64(40000), u64(10_000_000), u64(0)]) };
  const feeAta = getAssociatedTokenAddressSync(NATIVE_MINT, admin.publicKey);
  await createAssociatedTokenAccountIdempotent(conn, admin, NATIVE_MINT, admin.publicKey);
  const [m0, m1] = A.toBuffer().compare(B.toBuffer()) < 0 ? [A, B] : [B, A];
  const keys = getCreatePoolKeys({ programId: CP, configId: cfgId, mintA: m0, mintB: m1 });
  const lpAta = getAssociatedTokenAddressSync(keys.lpMint, admin.publicKey);
  const initIx = makeCreateCpmmPoolInInstruction(CP, admin.publicKey, cfgId, keys.authority, keys.poolId, m0, m1, keys.lpMint, atas[m0.toBase58()], atas[m1.toBase58()], lpAta, keys.vaultA, keys.vaultB, feeAta, TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, keys.observationId, new BN(20_000_000).mul(new BN(SIX)), new BN(20_000_000).mul(new BN(SIX)), new BN(0));
  const rsIndex = Math.floor(Math.random() * 60000) + 1;
  const rsIx = makeCreateRulesetInstruction(CP, admin.publicKey, rsIndex, RuleKind.ImmutableMint, 0, PublicKey.default);
  await sendAndConfirmTransaction(conn, new Transaction().add(cfgIx as any, initIx, rsIx), [admin]);
  ok("config + pool A/B + ruleset(ImmutableMint)", true, keys.poolId.toBase58());

  // --- SDK: collection, members, bind, add member
  const collIdx = Math.floor(Math.random() * 60000) + 1;
  const { execute: e1, extInfo: c1 } = await raydium.collections.createCollection({ amm: "cpmm", rulesetIndex: rsIndex, quoteMint: A, index: collIdx, rebalanceFeeDivisor: 100, txVersion: TxVersion.V0 });
  await e1({ sendAndConfirm: true });
  const collection = c1.collection;
  for (const m of [A, B, C]) { const { execute } = await raydium.collections.registerMember({ amm: "cpmm", collection, mint: m, txVersion: TxVersion.V0 }); await execute({ sendAndConfirm: true }); }
  const members = await raydium.collections.getMembers("cpmm", collection);
  ok("3 members registered via SDK", members.length === 3, members.map((m) => m.rate.toString()).join(","));
  const { execute: e2 } = await raydium.collections.bindPool({ amm: "cpmm", poolId: keys.poolId, collection, baseMint: B, amp: 200, members: [{ mint: C }], txVersion: TxVersion.V0 });
  await e2({ sendAndConfirm: true });
  const pm = await raydium.collections.getPoolMembers("cpmm", keys.poolId);
  ok("pool bound with 2 members (B base, C)", !!pm && pm.members.length === 2 && pm.members[0].mint.equals(B) && pm.members[1].mint.equals(C));
  // seed C's vault
  const cVault = getPdaMemberVault(CP, keys.poolId, C).publicKey;
  await transfer(conn, admin, atas[C.toBase58()], cVault, admin, BigInt(20_000_000) * BigInt(SIX));

  // --- quote vs execution, v1 transaction
  const state = await raydium.collections.getIntraSwapState("cpmm", keys.poolId);
  const amountIn = new BN(1_000_000).mul(new BN(SIX));
  const quote = raydium.collections.quote(state, 0, 1, amountIn);
  const before = (await getAccount(conn, atas[C.toBase58()])).amount;
  const { execute: e3, transaction } = await raydium.collections.intraSwap({ amm: "cpmm", poolId: keys.poolId, fromMint: B, toMint: C, amountIn, slippageBps: 10, txVersion: TxVersion.V1 });
  const ser = (transaction as any).serialize();
  ok("built as transaction v1", ser[0] === 0x81 || (transaction as any).version === 1, `${ser.length} bytes, version ${(transaction as any).version}`);
  const { txId } = await e3({ sendAndConfirm: true, skipPreflight: false });
  const after = (await getAccount(conn, atas[C.toBase58()])).amount;
  const got = new BN((after - before).toString());
  ok("SDK quote matches on-chain output exactly", got.eq(quote.amountOut), `quote ${quote.amountOut} got ${got} fee ${quote.tradeFee} price ${quote.priceX9.toNumber() / 1e9}`);
  const tx = await conn.getTransaction(txId, { maxSupportedTransactionVersion: 1 as any, commitment: "confirmed" });
  ok("landed as v1 on the validator", (tx as any)?.version === 1, `CU ${tx?.meta?.computeUnitsConsumed}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
