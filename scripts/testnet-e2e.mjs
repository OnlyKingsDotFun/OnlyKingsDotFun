// Testnet e2e for our CP-Swap / CLMM forks: pump.fun multipooling and LST multipooling, v1 transactions first.
//   node scripts/testnet-e2e.mjs            (needs keys/*.pub, ~/test.json funded, programs deployed)
// Flow: launch two pump.fun coins on testnet and buy some · deposit SOL into three real stake pools to get LSTs ·
// CP-Swap: pump collection pool (coinA/WSOL pair + coinB member, intra swaps) and LST collection pool
// (LST1/WSOL pair + LST2/LST3 members, intra swaps at live stake-pool rates, rate sync) · CLMM: LST collection pool.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import {
  AccountRole, address, appendTransactionMessageInstructions, createKeyPairSignerFromBytes, createSolanaRpc,
  createTransactionMessage, generateKeyPairSigner, getAddressEncoder, getBase64EncodedWireTransaction,
  getProgramDerivedAddress, getSignatureFromTransaction, pipe, setTransactionMessageComputeUnitLimit,
  setTransactionMessageFeePayerSigner, setTransactionMessageLifetimeUsingBlockhash,
  setTransactionMessageLoadedAccountsDataSizeLimit, setTransactionMessagePriorityFeeLamports, signTransactionMessageWithSigners,
  getAddressDecoder,
} from "@solana/kit";

const RPC = process.env.RPC_URL ?? "https://api.testnet.solana.com";
const rpc = createSolanaRpc(RPC);
const explorer = (sig) => `https://explorer.solana.com/tx/${sig}?cluster=testnet`;
const admin = await createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(readFileSync(process.env.KEYPAIR ?? `${homedir()}/test.json`, "utf8"))));
const CP = address(readFileSync("keys/cpmm-testnet.pub", "utf8").trim());
const CL = address(readFileSync("keys/clmm-testnet.pub", "utf8").trim());
const SYS = address("11111111111111111111111111111111"), TOKEN = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), TOKEN22 = address("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const ATA_PROGRAM = address("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"), MEMO = address("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"), RENT = address("SysvarRent111111111111111111111111111111111");
const WSOL = address("So11111111111111111111111111111111111111112");
const PUMP = address("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"), PUMP_FEE_PROGRAM = address("pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ"), METAPLEX = address("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const STAKE_POOL_PROGRAM = address("SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy");
// three live testnet stake pools (pool, mint)
const STAKE_POOLS = [["Bfsjaei6LgTNRtXMcu9h1iAwKs4pzqwQSJ41LjXwCcuc", "2nVShEvgW6Drdqd5vonufL28qtG4wQBxmhhi7TzHc9kx"], ["BokDGXC8fKg4QhPRMAxAcT7JdwpVzWCXrf8ud6o1x8Qs", "n6WVr5324v9WPqgo7Jdimme17HBzW1goonUhFwV7Qfa"], ["BdyMojQ3ZeF9Dg23AuyxqzUDuipVB3q9LUCKeqCgkuMR", "AVQzUKK3jRpVRiLhQsnVN9co5KA8RxXi5VkzHHsu22L7"]].map(([p, m]) => ({ pool: address(p), mint: address(m) }));
const enc = getAddressEncoder();
const disc = (n) => createHash("sha256").update(n).digest().subarray(0, 8);
const u8 = (v) => Buffer.from([v]); const u16le = (v) => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; }; const u16be = (v) => { const b = Buffer.alloc(2); b.writeUInt16BE(v); return b; };
const u32le = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; }; const i32be = (v) => { const b = Buffer.alloc(4); b.writeInt32BE(v); return b; }; const i32le = (v) => { const b = Buffer.alloc(4); b.writeInt32LE(v); return b; };
const u64 = (v) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return b; }; const u128 = (v) => { const b = Buffer.alloc(16); b.writeBigUInt64LE(BigInt(v) & ((1n << 64n) - 1n)); b.writeBigUInt64LE(BigInt(v) >> 64n, 8); return b; };
const str = (s) => { const b = Buffer.from(s, "utf8"); return Buffer.concat([u32le(b.length), b]); };
const W = (a) => ({ address: a, role: AccountRole.WRITABLE }); const R = (a) => ({ address: a, role: AccountRole.READONLY });
const S = (signer, writable = true) => ({ address: signer.address, role: writable ? AccountRole.WRITABLE_SIGNER : AccountRole.READONLY_SIGNER, signer });
const ix = (programAddress, accounts, data) => ({ programAddress, accounts, data: new Uint8Array(data) });
const pda = async (program, seeds) => (await getProgramDerivedAddress({ programAddress: program, seeds }))[0];
const ata = (mint, owner, tp = TOKEN) => pda(ATA_PROGRAM, [enc.encode(owner), enc.encode(tp), enc.encode(mint)]);
const lt = (a, b) => Buffer.compare(Buffer.from(enc.encode(a)), Buffer.from(enc.encode(b))) < 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let stats = { v1: 0, v0: 0, bytes: [] };
async function send(label, instructions, { expectFail, signers = [] } = {}) {
  const { value: bh } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
  const build = (version) => pipe(
    createTransactionMessage({ version }),
    (m) => setTransactionMessageFeePayerSigner(admin, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(bh, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
    (m) => (version === 1 ? setTransactionMessagePriorityFeeLamports(100_000n, setTransactionMessageLoadedAccountsDataSizeLimit(32_000_000, setTransactionMessageComputeUnitLimit(1_400_000, m))) : m),
  );
  let version = 1, signed;
  try { signed = await signTransactionMessageWithSigners(build(1)); } catch { version = 0; signed = await signTransactionMessageWithSigners(build(0)); }
  const wire = getBase64EncodedWireTransaction(signed);
  const bytes = Buffer.from(wire, "base64").length;
  const sig = getSignatureFromTransaction(signed);
  try {
    await rpc.sendTransaction(wire, { encoding: "base64", skipPreflight: false, maxRetries: 10n, preflightCommitment: "confirmed" }).send();
  } catch (e) {
    const logs = e.context?.logs ?? e.cause?.context?.logs ?? [];
    const msg = String(e.cause?.message ?? e.context?.__serverMessage ?? e.message);
    if (expectFail) { const code = logs.find((l) => l.includes("Error Code:"))?.match(/Error Code: (\w+)/)?.[1] ?? msg.slice(0, 90); console.log(`✔ ${label} rejected as expected (${code})`); return null; }
    console.error(logs.join("\n")); throw new Error(`${label}: ${msg}`);
  }
  for (let i = 0; i < 120; i++) {
    const { value } = await rpc.getSignatureStatuses([sig]).send();
    const st = value[0];
    if (st?.err) { if (expectFail) { console.log(`✔ ${label} failed on chain as expected`); return null; } throw new Error(`${label} failed on chain: ${JSON.stringify(st.err)} ${explorer(sig)}`); }
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) break;
    await sleep(1000);
  }
  if (expectFail) throw new Error(`${label}: expected failure but landed ${sig}`);
  stats[version === 1 ? "v1" : "v0"]++; stats.bytes.push(bytes);
  const tx = await rpc.getTransaction(sig, { maxSupportedTransactionVersion: 1, encoding: "json", commitment: "confirmed" }).send();
  console.log(`✔ ${label}\n    v${tx?.version ?? version} · ${bytes} bytes · ${instructions.length} ix · ${tx?.meta?.computeUnitsConsumed ?? "?"} CU · ${explorer(sig)}`);
  return tx;
}
const bal = async (acct) => { try { const { value } = await rpc.getTokenAccountBalance(acct, { commitment: "confirmed" }).send(); return BigInt(value.amount); } catch { return 0n; } };
const accountData = async (a) => { const { value } = await rpc.getAccountInfo(a, { encoding: "base64", commitment: "confirmed" }).send(); return value ? Buffer.from(value.data[0], "base64") : null; };
const eventU64 = (tx, name, off) => { for (const l of tx?.meta?.logMessages ?? []) { if (!l.startsWith("Program data: ")) continue; const d = Buffer.from(l.slice(14), "base64"); if (d.subarray(0, 8).equals(disc(name)) && d.length >= off + 8) return d.readBigUInt64LE(off); } return null; };

// SPL helpers
const createAtaIx = async (mint, owner, tp = TOKEN) => ix(ATA_PROGRAM, [S(admin), W(await ata(mint, owner, tp)), R(owner), R(mint), R(SYS), R(tp)], u8(1));
const transferIx = async (mint, to, amount, decimals) => ix(TOKEN, [W(await ata(mint, admin.address)), R(mint), W(to), S(admin, false)], Buffer.concat([u8(12), u64(amount), u8(decimals)]));
const syncNativeIx = (acct) => ix(TOKEN, [W(acct)], u8(17));
const auxWsol = await generateKeyPairSigner();
const tokenAcctRent = BigInt(await rpc.getMinimumBalanceForRentExemption(165n).send());
const wrapSolIxs = async (lamports) => [
  await createAtaIx(WSOL, admin.address), // fee receiver, must stay distinct from our own WSOL account
  ix(SYS, [S(admin), S(auxWsol)], Buffer.concat([u32le(0), u64(tokenAcctRent + lamports), u64(165), Buffer.from(enc.encode(TOKEN))])),
  ix(TOKEN, [W(auxWsol.address), R(WSOL)], Buffer.concat([u8(18), Buffer.from(enc.encode(admin.address))])),
  syncNativeIx(auxWsol.address),
];
/// our token account for a mint: the aux account for WSOL, the ATA otherwise
const ua = async (mint) => (mint === WSOL ? auxWsol.address : ata(mint, admin.address));

console.log(`admin ${admin.address}\ncp-swap fork ${CP}\nclmm fork ${CL}`);
for (const p of [CP, CL]) { const info = await rpc.getAccountInfo(p, { encoding: "base64" }).send(); if (!info.value?.executable) throw new Error(`${p} not deployed: solana program deploy keys/...testnet.so --program-id keys/*.json -u testnet -k ~/test.json`); }
await send("create fee receiver WSOL ATA + wrap 200 SOL into an auxiliary WSOL account", await wrapSolIxs(200n * 10n ** 9n), { signers: [auxWsol] });

// ---------------------------------------------------------------- 1. pump.fun: launch two coins, buy some
console.log("\n== pump.fun launches on testnet");
const dec = getAddressDecoder();
const pumpGlobal = await pda(PUMP, ["global"]);
const globalData = await accountData(pumpGlobal);
const feeRecipient = dec.decode(globalData.subarray(41, 73)); // Global: disc | initialized | authority | fee_recipient
const eventAuthority = await pda(PUMP, ["__event_authority"]);
const mintAuthority = await pda(PUMP, ["mint-authority"]);
const FEE_CONFIG_CONST = Uint8Array.from([1,86,224,246,147,102,90,207,68,219,21,104,191,23,91,170,81,137,203,151,245,210,255,59,101,93,43,182,253,109,24,176]);
const feeConfig = await pda(PUMP_FEE_PROGRAM, ["fee_config", FEE_CONFIG_CONST]);
const curveOf = (mint) => pda(PUMP, ["bonding-curve", enc.encode(mint)]);
async function pumpCreateIx(mintSigner, name, symbol) {
  const curve = await curveOf(mintSigner.address);
  const metadata = await pda(METAPLEX, ["metadata", enc.encode(METAPLEX), enc.encode(mintSigner.address)]);
  return ix(PUMP, [S(mintSigner), R(mintAuthority), W(curve), W(await ata(mintSigner.address, curve)), R(pumpGlobal), R(METAPLEX), W(metadata), S(admin), R(SYS), R(TOKEN), R(ATA_PROGRAM), R(RENT), R(eventAuthority), R(PUMP)],
    Buffer.concat([Buffer.from([24, 30, 200, 40, 5, 28, 7, 119]), str(name), str(symbol), str(`https://stacc.sol/${symbol.toLowerCase()}.json`), Buffer.from(enc.encode(admin.address))]));
}
async function pumpBuyIx(mint, amount, maxSol) {
  const curve = await curveOf(mint);
  const cd = await accountData(curve);
  const creator = dec.decode(cd.subarray(49, 81));
  return ix(PUMP, [R(pumpGlobal), W(feeRecipient), R(mint), W(curve), W(await ata(mint, curve)), W(await ata(mint, admin.address)), S(admin), R(SYS), R(TOKEN), W(await pda(PUMP, ["creator-vault", enc.encode(creator)])), R(eventAuthority), R(PUMP), W(await pda(PUMP, ["global_volume_accumulator"])), W(await pda(PUMP, ["user_volume_accumulator", enc.encode(admin.address)])), R(feeConfig), R(PUMP_FEE_PROGRAM)],
    Buffer.concat([Buffer.from([102, 6, 61, 18, 1, 218, 235, 234]), u64(amount), u64(maxSol), u8(0)]));
}
const [coinA, coinB] = [await generateKeyPairSigner(), await generateKeyPairSigner()];
await send("pump.fun create MEMEA + MEMEB (standard, non-mayhem)", [await pumpCreateIx(coinA, "Stacc Meme A", "MEMEA"), await pumpCreateIx(coinB, "Stacc Meme B", "MEMEB")], { signers: [coinA, coinB] });
const SIX = 10n ** 6n, NINE = 10n ** 9n;
await send("buy 50M MEMEA and 50M MEMEB off their curves", [await createAtaIx(coinA.address, admin.address), await createAtaIx(coinB.address, admin.address), await pumpBuyIx(coinA.address, 50_000_000n * SIX, 5n * NINE), await pumpBuyIx(coinB.address, 50_000_000n * SIX, 5n * NINE)]);
const [A, B] = [coinA.address, coinB.address];
console.log(`  MEMEA ${A} balance ${await bal(await ata(A, admin.address))}\n  MEMEB ${B} balance ${await bal(await ata(B, admin.address))}`);
for (const m of [A, B]) { const d = await accountData(await curveOf(m)); console.log(`  curve ${await curveOf(m)} len ${d.length} complete ${d[48]} mayhem ${d[81]}`); }

// ---------------------------------------------------------------- 2. LSTs: deposit SOL into three live stake pools
console.log("\n== stake pool deposits (real testnet LSTs)");
const lsts = [];
for (const sp of STAKE_POOLS) {
  const d = await accountData(sp.pool);
  const reserve = dec.decode(d.subarray(130, 162)), feeAcct = dec.decode(d.subarray(194, 226));
  const withdrawAuth = await pda(STAKE_POOL_PROGRAM, [enc.encode(sp.pool), "withdraw"]);
  const rate = Number(d.readBigUInt64LE(258)) / Number(d.readBigUInt64LE(266));
  const dest = await ata(sp.mint, admin.address);
  const tx = await send(`DepositSol 100 SOL into ${sp.pool} (rate ${rate.toFixed(6)})`, [await createAtaIx(sp.mint, admin.address), ix(STAKE_POOL_PROGRAM, [W(sp.pool), R(withdrawAuth), W(reserve), S(admin), W(dest), W(feeAcct), W(dest), W(sp.mint), R(SYS), R(TOKEN)], Buffer.concat([u8(14), u64(100n * NINE)]))], { expectFail: false }).catch((e) => { console.log(`  skipped ${sp.pool}: ${String(e.message).slice(0, 100)}`); return null; });
  if (tx) lsts.push({ ...sp, rate, balance: await bal(dest) });
}
if (lsts.length < 2) throw new Error("need at least two LSTs");
console.log(lsts.map((l) => `  ${l.mint} rate ${l.rate.toFixed(6)} balance ${l.balance}`).join("\n"));

// ---------------------------------------------------------------- CP-Swap helpers
const cpAuth = await pda(CP, ["vault_and_lp_mint_auth_seed"]);
const feeAta = await ata(WSOL, admin.address);
async function cpConfig(index, tradeFee) {
  const cfg = await pda(CP, ["amm_config", u16be(index)]);
  return { cfg, ix: ix(CP, [S(admin), W(cfg), R(SYS)], Buffer.concat([disc("global:create_amm_config"), u16le(index), u64(tradeFee), u64(120_000), u64(40_000), u64(10_000_000), u64(0)])) };
}
async function cpPool(cfg, base, quote, baseAmt, quoteAmt) {
  const [m0, m1] = lt(base, quote) ? [base, quote] : [quote, base];
  const [a0, a1] = m0 === base ? [baseAmt, quoteAmt] : [quoteAmt, baseAmt];
  const pool = await pda(CP, ["pool", enc.encode(cfg), enc.encode(m0), enc.encode(m1)]);
  const lp = await pda(CP, ["pool_lp_mint", enc.encode(pool)]);
  const [v0, v1] = [await pda(CP, ["pool_vault", enc.encode(pool), enc.encode(m0)]), await pda(CP, ["pool_vault", enc.encode(pool), enc.encode(m1)])];
  const obs = await pda(CP, ["observation", enc.encode(pool)]);
  const init = ix(CP, [S(admin), R(cfg), R(cpAuth), W(pool), R(m0), R(m1), W(lp), W(await ua(m0)), W(await ua(m1)), W(await ata(lp, admin.address)), W(v0), W(v1), W(feeAta), W(obs), R(TOKEN), R(TOKEN), R(TOKEN), R(ATA_PROGRAM), R(SYS), R(RENT)], Buffer.concat([disc("global:initialize"), u64(a0), u64(a1), u64(0)]));
  const baseVault = m0 === base ? v0 : v1;
  return { pool, cfg, m0, m1, v0, v1, obs, baseVault, init };
}
const cpRuleset = (i) => pda(CP, ["ruleset", u16le(i)]);
const cpCollection = (i) => pda(CP, ["token_collection", enc.encode(admin.address), u16le(i)]);
const cpMember = (c, m) => pda(CP, ["collection_member", enc.encode(c), enc.encode(m)]);
const cpPoolMembers = (pool) => pda(CP, ["pool_members", enc.encode(pool)]);
const cpMemberVault = (pool, m) => pda(CP, ["member_vault", enc.encode(pool), enc.encode(m)]);
const cpCreateRuleset = async (i, kind, program) => ix(CP, [S(admin), W(await cpRuleset(i)), R(SYS)], Buffer.concat([disc("global:create_ruleset"), u16le(i), u8(kind), u8(0), Buffer.from(enc.encode(program))]));
const cpCreateCollection = async (rs, i, quote, divisor) => ix(CP, [S(admin), R(await cpRuleset(rs)), R(quote), W(await cpCollection(i)), R(SYS)], Buffer.concat([disc("global:create_token_collection"), u16le(i), u32le(divisor)]));
const cpRegister = async (c, rs, mint, proof = []) => ix(CP, [S(admin), W(c), R(await cpRuleset(rs)), R(mint), W(await cpMember(c, mint)), R(SYS), ...proof.map(R)], disc("global:register_collection_member"));
const cpInitMembers = async (p, c, base, amp) => ix(CP, [S(admin), R(p.pool), R(c), R(await cpMember(c, base)), W(await cpPoolMembers(p.pool)), R(SYS)], Buffer.concat([disc("global:init_pool_members"), u64(amp)]));
const cpAddMember = async (p, c, mint) => ix(CP, [S(admin), R(cpAuth), R(p.pool), W(await cpPoolMembers(p.pool)), R(await cpMember(c, mint)), R(mint), W(await cpMemberVault(p.pool, mint)), R(TOKEN), R(SYS), R(RENT)], disc("global:add_pool_member"));
/// members: [{mint, vault}] by index (0 = base)
const cpIntra = async (p, c, members, i, j, amount) => {
  const keys = [S(admin, false), R(cpAuth), R(p.cfg), W(p.pool), W(await cpPoolMembers(p.pool)), R(c), W(await ata(members[i].mint, admin.address)), W(await ata(members[j].mint, admin.address)), W(members[i].vault), W(members[j].vault), R(TOKEN), R(TOKEN), R(members[i].mint), R(members[j].mint)];
  for (const m of members) keys.push(R(m.vault), R(await cpMember(c, m.mint)));
  return ix(CP, keys, Buffer.concat([disc("global:intra_swap"), u8(i), u8(j), u64(amount), u64(0)]));
};
const cpSwap = async (p, inM, outM, amt) => { const zfo = inM === p.m0; return ix(CP, [S(admin, false), R(cpAuth), R(p.cfg), W(p.pool), W(await ua(inM)), W(await ua(outM)), W(zfo ? p.v0 : p.v1), W(zfo ? p.v1 : p.v0), R(TOKEN), R(TOKEN), R(inM), R(outM), W(p.obs)], Buffer.concat([disc("global:swap_base_input"), u64(amt), u64(0)])); };
const rnd = () => Math.floor(Math.random() * 60000) + 1;

// ---------------------------------------------------------------- 3. CP-Swap: pump collection pool
console.log("\n== CP-Swap: pump collection pool (MEMEA/WSOL pair + MEMEB member)");
const { cfg: cfgMeme, ix: cfgMemeIx } = await cpConfig(rnd(), 2500);
const memePool = await cpPool(cfgMeme, A, WSOL, 20_000_000n * SIX, 2n * NINE);
const [rsPump, collPump] = [rnd(), rnd()];
const cPump = await cpCollection(collPump);
await send("create_amm_config + initialize MEMEA/WSOL (20M MEMEA, 2 SOL) + create_ruleset(PumpFunLaunch) + collection(quote WSOL, fee/100)", [cfgMemeIx, memePool.init, await cpCreateRuleset(rsPump, 1, PUMP), await cpCreateCollection(rsPump, collPump, WSOL, 100)]);
await send("register WSOL (quote), MEMEA and MEMEB with their real bonding curves as proof; bind pool; add MEMEB member", [await cpRegister(cPump, rsPump, WSOL), await cpRegister(cPump, rsPump, A, [await curveOf(A)]), await cpRegister(cPump, rsPump, B, [await curveOf(B)]), await cpInitMembers(memePool, cPump, A, 200), await cpAddMember(memePool, cPump, B)]);
const memeMembers = [{ mint: A, vault: memePool.baseVault }, { mint: B, vault: await cpMemberVault(memePool.pool, B) }];
await send("seed the MEMEB member vault with 20M MEMEB (plain transfer, like a first LP deposit)", [await transferIx(B, memeMembers[1].vault, 20_000_000n * SIX, 6)]);
let before = await bal(await ata(B, admin.address));
let t = await send("intra_swap 1,000,000 MEMEA -> MEMEB inside the pool (rate 1:1, fee/100)", [await cpIntra(memePool, cPump, memeMembers, 0, 1, 1_000_000n * SIX)]);
console.log(`  got ${(await bal(await ata(B, admin.address))) - before} MEMEB · trade_fee ${eventU64(t, "event:IntraSwapEvent", 120)}`);
before = await bal(await ata(A, admin.address));
t = await send("intra_swap 500,000 MEMEB -> MEMEA", [await cpIntra(memePool, cPump, memeMembers, 1, 0, 500_000n * SIX)]);
console.log(`  got ${(await bal(await ata(A, admin.address))) - before} MEMEA · trade_fee ${eventU64(t, "event:IntraSwapEvent", 120)}`);
t = await send("extra swap unchanged: swap_base_input 0.1 SOL -> MEMEA on the pair curve", [await cpSwap(memePool, WSOL, A, NINE / 10n)]);
console.log(`  pair trade_fee ${eventU64(t, "event:SwapEvent", 153)} (2500 ppm)`);

// ---------------------------------------------------------------- 4. CP-Swap: LST collection pool
console.log("\n== CP-Swap: LST collection pool (LST1/WSOL pair + LST2.. members at live rates)");
const { cfg: cfgLst, ix: cfgLstIx } = await cpConfig(rnd(), 100);
const [L1, ...Lrest] = lsts;
const lstPool = await cpPool(cfgLst, L1.mint, WSOL, 20n * NINE, 20n * NINE);
const [rsLst, collLst] = [rnd(), rnd()];
const cLst = await cpCollection(collLst);
await send("create_amm_config(100 ppm) + initialize LST1/WSOL + create_ruleset(Lst, stake pool program) + collection(quote WSOL, fee/1000)", [cfgLstIx, lstPool.init, await cpCreateRuleset(rsLst, 3, STAKE_POOL_PROGRAM), await cpCreateCollection(rsLst, collLst, WSOL, 1000)]);
await send("register WSOL + every LST with its stake pool as proof (rate = live exchange rate); bind pool; add members", [await cpRegister(cLst, rsLst, WSOL), ...(await Promise.all(lsts.map((l) => cpRegister(cLst, rsLst, l.mint, [l.pool])))), await cpInitMembers(lstPool, cLst, L1.mint, 200), ...(await Promise.all(Lrest.map((l) => cpAddMember(lstPool, cLst, l.mint))))]);
for (const l of lsts) { const d = await accountData(await cpMember(cLst, l.mint)); console.log(`  member ${l.mint} rate ${d.readBigUInt64LE(80)} (stake pool ${l.rate.toFixed(6)})`); }
const lstMembers = [{ mint: L1.mint, vault: lstPool.baseVault }, ...(await Promise.all(Lrest.map(async (l) => ({ mint: l.mint, vault: await cpMemberVault(lstPool.pool, l.mint) }))))];
await send("seed member vaults with 30 LST each", await Promise.all(Lrest.map((l, k) => transferIx(l.mint, lstMembers[k + 1].vault, 30n * NINE, 9))));
before = await bal(await ata(Lrest[0].mint, admin.address));
t = await send(`intra_swap 5 LST1 -> LST2 (expect ≈ 5 × ${L1.rate.toFixed(6)} / ${Lrest[0].rate.toFixed(6)} = ${(5 * L1.rate / Lrest[0].rate).toFixed(4)} LST2, fee/1000)`, [await cpIntra(lstPool, cLst, lstMembers, 0, 1, 5n * NINE)]);
console.log(`  got ${Number((await bal(await ata(Lrest[0].mint, admin.address))) - before) / 1e9} LST2 · trade_fee ${eventU64(t, "event:IntraSwapEvent", 120)}`);
await send("sync_member_rate(LST2) from its stake pool, no signer", [ix(CP, [R(cLst), R(await cpRuleset(rsLst)), W(await cpMember(cLst, Lrest[0].mint)), R(Lrest[0].pool)], disc("global:sync_member_rate"))]);
if (lstMembers.length > 2) { before = await bal(await ata(Lrest[1].mint, admin.address)); await send("intra_swap 3 LST2 -> LST3", [await cpIntra(lstPool, cLst, lstMembers, 1, 2, 3n * NINE)]); console.log(`  got ${Number((await bal(await ata(Lrest[1].mint, admin.address))) - before) / 1e9} LST3`); }

// ---------------------------------------------------------------- 5. CLMM: LST collection pool
console.log("\n== CLMM: LST collection pool");
const clCfgIndex = rnd();
const clCfg = await pda(CL, ["amm_config", u16be(clCfgIndex)]);
const [n0, n1] = lt(L1.mint, WSOL) ? [L1.mint, WSOL] : [WSOL, L1.mint];
const clPool = await pda(CL, ["pool", enc.encode(clCfg), enc.encode(n0), enc.encode(n1)]);
const [cv0, cv1] = [await pda(CL, ["pool_vault", enc.encode(clPool), enc.encode(n0)]), await pda(CL, ["pool_vault", enc.encode(clPool), enc.encode(n1)])];
const clObs = await pda(CL, ["observation", enc.encode(clPool)]);
const bitmap = await pda(CL, ["pool_tick_array_bitmap_extension", enc.encode(clPool)]);
const SPACING = 10, PER = 60 * SPACING, startIdx = (t) => Math.floor(t / PER) * PER;
// price token1/token0 = LST1 rate (or its inverse), equal decimals -> sqrt price
const price = n0 === L1.mint ? 1 / L1.rate : L1.rate;
const sqrtX64 = BigInt(Math.round(Math.sqrt(price) * 2 ** 32)) << 32n;
const tickAt = Math.round(Math.log(price) / Math.log(1.0001));
const [lower, upper] = [Math.floor((tickAt - 2000) / SPACING) * SPACING, Math.ceil((tickAt + 2000) / SPACING) * SPACING];
const [taL, taU] = [await pda(CL, ["tick_array", enc.encode(clPool), i32be(startIdx(lower))]), await pda(CL, ["tick_array", enc.encode(clPool), i32be(startIdx(upper))])];
const nft = await generateKeyPairSigner();
const protoPos = await pda(CL, ["position", enc.encode(clPool), i32be(lower), i32be(upper)]);
const personalPos = await pda(CL, ["position", enc.encode(nft.address)]);
await send(`CLMM create_amm_config + create_pool LST1/WSOL at ${price.toFixed(6)} + open_position [${lower}, ${upper}]`, [
  ix(CL, [S(admin), W(clCfg), R(SYS)], Buffer.concat([disc("global:create_amm_config"), u16le(clCfgIndex), u16le(SPACING), u32le(100), u32le(120_000), u32le(40_000)])),
  ix(CL, [S(admin), R(clCfg), W(clPool), R(n0), R(n1), W(cv0), W(cv1), W(clObs), W(bitmap), R(TOKEN), R(TOKEN), R(SYS), R(RENT)], Buffer.concat([disc("global:create_pool"), u128(sqrtX64), u64(0)])),
  ix(CL, [S(admin), R(admin.address), S(nft), W(await ata(nft.address, admin.address, TOKEN22)), W(clPool), W(protoPos), W(taL), W(taU), W(personalPos), W(await ua(n0)), W(await ua(n1)), W(cv0), W(cv1), R(RENT), R(SYS), R(TOKEN), R(ATA_PROGRAM), R(TOKEN22), R(n0), R(n1)],
    Buffer.concat([disc("global:open_position_with_token22_nft"), i32le(lower), i32le(upper), i32le(startIdx(lower)), i32le(startIdx(upper)), u128(100n * NINE), u64(20n * NINE), u64(20n * NINE), u8(0), u8(0)])),
], { signers: [nft] });
const clRuleset = (i) => pda(CL, ["ruleset", u16le(i)]);
const clCollection = (i) => pda(CL, ["token_collection", enc.encode(admin.address), u16le(i)]);
const clMember = (c, m) => pda(CL, ["collection_member", enc.encode(c), enc.encode(m)]);
const clPoolMembers = await pda(CL, ["pool_members", enc.encode(clPool)]);
const clMemberVault = (m) => pda(CL, ["member_vault", enc.encode(clPool), enc.encode(m)]);
const [rsCl, collCl] = [rnd(), rnd()];
const cCl = await clCollection(collCl);
const L2 = Lrest[0];
await send("CLMM create_ruleset(Lst) + collection + register WSOL, LST1, LST2 + init_pool_members + add LST2 member", [
  ix(CL, [S(admin), W(await clRuleset(rsCl)), R(SYS)], Buffer.concat([disc("global:create_ruleset"), u16le(rsCl), u8(3), u8(0), Buffer.from(enc.encode(STAKE_POOL_PROGRAM))])),
  ix(CL, [S(admin), R(await clRuleset(rsCl)), R(WSOL), W(cCl), R(SYS)], Buffer.concat([disc("global:create_token_collection"), u16le(collCl), u32le(1000)])),
  ix(CL, [S(admin), W(cCl), R(await clRuleset(rsCl)), R(WSOL), W(await clMember(cCl, WSOL)), R(SYS)], disc("global:register_collection_member")),
  ix(CL, [S(admin), W(cCl), R(await clRuleset(rsCl)), R(L1.mint), W(await clMember(cCl, L1.mint)), R(SYS), R(L1.pool)], disc("global:register_collection_member")),
  ix(CL, [S(admin), W(cCl), R(await clRuleset(rsCl)), R(L2.mint), W(await clMember(cCl, L2.mint)), R(SYS), R(L2.pool)], disc("global:register_collection_member")),
  ix(CL, [S(admin), R(clPool), R(cCl), R(await clMember(cCl, L1.mint)), W(clPoolMembers), R(SYS)], Buffer.concat([disc("global:init_pool_members"), u64(200)])),
  ix(CL, [S(admin), R(clPool), W(clPoolMembers), R(await clMember(cCl, L2.mint)), R(L2.mint), W(await clMemberVault(L2.mint)), R(TOKEN), R(SYS)], disc("global:add_pool_member")),
]);
const clBaseVault = n0 === L1.mint ? cv0 : cv1;
const clMembers = [{ mint: L1.mint, vault: clBaseVault }, { mint: L2.mint, vault: await clMemberVault(L2.mint) }];
await send("seed LST2 member vault (20 LST2)", [await transferIx(L2.mint, clMembers[1].vault, 20n * NINE, 9)]);
const clIntra = async (i, j, amount) => {
  const keys = [S(admin, false), R(clCfg), W(clPool), W(clPoolMembers), R(cCl), W(await ata(clMembers[i].mint, admin.address)), W(await ata(clMembers[j].mint, admin.address)), W(clMembers[i].vault), W(clMembers[j].vault), R(TOKEN), R(TOKEN22), R(clMembers[i].mint), R(clMembers[j].mint)];
  for (const m of clMembers) keys.push(R(m.vault), R(await clMember(cCl, m.mint)));
  return ix(CL, keys, Buffer.concat([disc("global:intra_swap"), u8(i), u8(j), u64(amount), u64(0)]));
};
before = await bal(await ata(L2.mint, admin.address));
t = await send("CLMM intra_swap 2 LST1 -> LST2 inside the pool", [await clIntra(0, 1, 2n * NINE)]);
console.log(`  got ${Number((await bal(await ata(L2.mint, admin.address))) - before) / 1e9} LST2 · trade_fee ${eventU64(t, "event:IntraSwapEvent", 120)}`);
before = await bal(await ata(L1.mint, admin.address));
await send("CLMM intra_swap 1 LST2 -> LST1", [await clIntra(1, 0, 1n * NINE)]);
console.log(`  got ${Number((await bal(await ata(L1.mint, admin.address))) - before) / 1e9} LST1`);

console.log(`\ndone: ${stats.v1} v1 transactions, ${stats.v0} v0 fallbacks, largest ${Math.max(...stats.bytes)} bytes`);
console.log(`pump pool ${memePool.pool} · LST pool ${lstPool.pool} · CLMM LST pool ${clPool}\ncollections: pump ${cPump} · LST ${cLst} · CLMM ${cCl}`);
