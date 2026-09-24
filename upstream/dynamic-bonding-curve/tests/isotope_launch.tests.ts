/**
 * Isotope launchpad crank, end to end on LiteSVM with the real Meteora DBC + DAMM v2 programs:
 * our PDA is the DBC fee_claimer (50% liquid partner LP), a coin launches, the curve completes,
 * Meteora migrates to DAMM v2, then the crank unwinds the partner position and builds
 * newmeme/quote, newmeme/protocol pairs on our cp-swap fork and drops the rest into the launch multipool.
 */
import { createHash } from "crypto";
import path from "path";
import { expect } from "chai";
import { NATIVE_MINT, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction, createInitializeMint2Instruction, MINT_SIZE, createSyncNativeInstruction, AccountLayout } from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction, TransactionInstruction } from "@solana/web3.js";
import { BN } from "bn.js";
import { LiteSVM } from "litesvm";
import { BaseFee, ConfigParameters, createConfig, createPoolWithSplToken, swap, SwapMode } from "./instructions";
import { createMeteoraDammV2Metadata, migrateToDammV2, deriveDammV2EventAuthority, derivePositionAddress, derivePositionNftAccount, deriveDammV2PoolAuthority } from "./instructions/dammV2Migration";
import { createDammV2Config, createDammV2Operator, createVirtualCurveProgram, DammV2OperatorPermission, derivePoolAuthority, encodePermissions, generateAndFund, MAX_SQRT_PRICE, MIN_SQRT_PRICE, startSvm, U64_MAX, sendTransactionMaybeThrow } from "./utils";
import { getVirtualPool, getDammV2Pool } from "./utils/fetcher";
import { warpSlotBy } from "./utils/common";
import { DAMM_V2_PROGRAM_ID, DYNAMIC_BONDING_CURVE_PROGRAM_ID } from "./utils/constants";

const CP = new PublicKey("CY3u73vvVtGa5vojxDoKyg4cn7QWYRDzLTBN9jQKm5RH"); // our cp-swap fork (testnet build, admin = ~/test.json)
const LAUNCH = new PublicKey("LNCHrLBqZpUmvvB7Nn5VZbdD5mW9WVWdU1Hs2k9bKqm");
const disc = (n: string) => createHash("sha256").update(n).digest().subarray(0, 8);
const u16 = (v: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; };
const u16be = (v: number) => { const b = Buffer.alloc(2); b.writeUInt16BE(v); return b; };
const u32 = (v: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; };
const u64 = (v: bigint | number) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return b; };
const w = (p: PublicKey, s = false) => ({ pubkey: p, isSigner: s, isWritable: true });
const r = (p: PublicKey, s = false) => ({ pubkey: p, isSigner: s, isWritable: false });
const pda = (seeds: (Buffer | Uint8Array)[], program: PublicKey) => PublicKey.findProgramAddressSync(seeds, program)[0];
const lt = (a: PublicKey, b: PublicKey) => a.toBuffer().compare(b.toBuffer()) < 0;
const tokenAmount = (svm: LiteSVM, k: PublicKey) => { const a = svm.getAccount(k); return a ? AccountLayout.decode(Buffer.from(a.data)).amount : 0n; };
const send = (svm: LiteSVM, ixs: TransactionInstruction[], signers: Keypair[]) => { const tx = new Transaction().add(...ixs); tx.feePayer = signers[0].publicKey; sendTransactionMaybeThrow(svm, tx, signers); };

describe("Isotope launchpad crank", () => {
  let svm: LiteSVM;
  let admin: Keypair; // must equal the admin baked into our program builds: ~/test.json
  let user: Keypair; let poolCreator: Keypair; let cranker: Keypair;
  let program: ReturnType<typeof createVirtualCurveProgram>;
  let config: PublicKey; let virtualPool: PublicKey; let dammPool: PublicKey; let firstPosition: PublicKey; let secondPosition: PublicKey;
  let baseMint: PublicKey; let protocolMint: Keypair; let adminWsol: PublicKey;
  const partner = pda([Buffer.from("partner")], LAUNCH);
  const global = pda([Buffer.from("global")], LAUNCH);
  const cpAuth = pda([Buffer.from("vault_and_lp_mint_auth_seed")], CP);
  let cpCfg: PublicKey; let ruleset: PublicKey; let collection: PublicKey; let collectionPool: PublicKey; let pqPool: PublicKey;
  const cpPool = (cfg: PublicKey, a: PublicKey, b: PublicKey) => { const [m0, m1] = lt(a, b) ? [a, b] : [b, a]; return { pool: pda([Buffer.from("pool"), cfg.toBuffer(), m0.toBuffer(), m1.toBuffer()], CP), m0, m1 }; };
  const cpKeys = (pool: PublicKey, m0: PublicKey, m1: PublicKey) => ({ lp: pda([Buffer.from("pool_lp_mint"), pool.toBuffer()], CP), v0: pda([Buffer.from("pool_vault"), pool.toBuffer(), m0.toBuffer()], CP), v1: pda([Buffer.from("pool_vault"), pool.toBuffer(), m1.toBuffer()], CP), obs: pda([Buffer.from("observation"), pool.toBuffer()], CP) });
  const ata = (mint: PublicKey, owner: PublicKey, tp = TOKEN_PROGRAM_ID) => getAssociatedTokenAddressSync(mint, owner, true, tp);

  before(async () => {
    svm = startSvm();
    svm.addProgramFromFile(CP, path.resolve(`${process.env.HOME}/collection-amm/keys/raydium_cp_swap.testnet.so`));
    svm.addProgramFromFile(LAUNCH, path.resolve("../.cargo-target/deploy/isotope_launch.so"));
    svm.airdrop(partner, BigInt(50 * LAMPORTS_PER_SOL));
    admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(require("fs").readFileSync(`${process.env.HOME}/test.json`, "utf8"))));
    svm.airdrop(admin.publicKey, BigInt(1000 * LAMPORTS_PER_SOL));
    user = generateAndFund(svm); poolCreator = generateAndFund(svm); cranker = generateAndFund(svm);
    program = createVirtualCurveProgram();
    await createDammV2Operator(svm, { whitelistAddress: admin.publicKey, admin, permission: encodePermissions([DammV2OperatorPermission.CreateConfigKey]) });
  });

  const launchIx = (name: string, keys: any[], data: Buffer = Buffer.alloc(0)) => new TransactionInstruction({ programId: LAUNCH, keys, data: Buffer.concat([disc(`global:${name}`), data]) });
  const member = (m: PublicKey) => pda([Buffer.from("collection_member"), collection.toBuffer(), m.toBuffer()], CP);

  it("protocol token, cp-swap fee tier, protocol/WSOL pool, launch collection anchored on the protocol token", async () => {
    protocolMint = Keypair.generate();
    const rent = Number(svm.minimumBalanceForRentExemption(BigInt(MINT_SIZE)));
    const pAta = ata(protocolMint.publicKey, admin.publicKey);
    const wAta = ata(NATIVE_MINT, admin.publicKey); // cp-swap create-pool fee receiver (baked into the fork build)
    const auxWsol = Keypair.generate(); // admin's own WSOL, must differ from the fee receiver (anchor 2040)
    const tokRent = Number(svm.minimumBalanceForRentExemption(165n));
    send(svm, [
      SystemProgram.createAccount({ fromPubkey: admin.publicKey, newAccountPubkey: protocolMint.publicKey, lamports: rent, space: MINT_SIZE, programId: TOKEN_PROGRAM_ID }),
      createInitializeMint2Instruction(protocolMint.publicKey, 6, admin.publicKey, null),
      createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, pAta, admin.publicKey, protocolMint.publicKey),
      createMintToInstruction(protocolMint.publicKey, pAta, admin.publicKey, 1_000_000_000n * 1_000_000n),
      createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, wAta, admin.publicKey, NATIVE_MINT),
      SystemProgram.createAccount({ fromPubkey: admin.publicKey, newAccountPubkey: auxWsol.publicKey, lamports: tokRent + 200 * LAMPORTS_PER_SOL, space: 165, programId: TOKEN_PROGRAM_ID }),
      new TransactionInstruction({ programId: TOKEN_PROGRAM_ID, keys: [w(auxWsol.publicKey), r(NATIVE_MINT)], data: Buffer.concat([Buffer.from([18]), admin.publicKey.toBuffer()]) }),
      createSyncNativeInstruction(auxWsol.publicKey),
    ], [admin, protocolMint, auxWsol]);
    adminWsol = auxWsol.publicKey;
    const idx = 7;
    cpCfg = pda([Buffer.from("amm_config"), u16be(idx)], CP);
    send(svm, [new TransactionInstruction({ programId: CP, keys: [w(admin.publicKey, true), w(cpCfg), r(SystemProgram.programId)], data: Buffer.concat([disc("global:create_amm_config"), u16(idx), u64(2500), u64(120000), u64(40000), u64(0), u64(0)]) })], [admin]);
    const { pool, m0, m1 } = cpPool(cpCfg, protocolMint.publicKey, NATIVE_MINT); pqPool = pool; collectionPool = pool;
    const k = cpKeys(pool, m0, m1);
    const amt = (m: PublicKey) => (m.equals(NATIVE_MINT) ? 100n * BigInt(LAMPORTS_PER_SOL) : 100_000_000n * 1_000_000n);
    send(svm, [new TransactionInstruction({ programId: CP, keys: [w(admin.publicKey, true), r(cpCfg), r(cpAuth), w(pool), r(m0), r(m1), w(k.lp), w(m0.equals(NATIVE_MINT) ? adminWsol : ata(m0, admin.publicKey)), w(m1.equals(NATIVE_MINT) ? adminWsol : ata(m1, admin.publicKey)), w(ata(k.lp, admin.publicKey)), w(k.v0), w(k.v1), w(wAta), w(k.obs), r(TOKEN_PROGRAM_ID), r(TOKEN_PROGRAM_ID), r(TOKEN_PROGRAM_ID), r(ASSOCIATED_TOKEN_PROGRAM_ID), r(SystemProgram.programId), r(SYSVAR_RENT_PUBKEY)], data: Buffer.concat([disc("global:initialize"), u64(amt(m0)), u64(amt(m1)), u64(0)]) })], [admin]);
    // ruleset LaunchpadDbc (program_id = our partner PDA); collection quote WSOL, anchor = protocol token
    ruleset = pda([Buffer.from("ruleset"), u16(4)], CP);
    collection = pda([Buffer.from("token_collection"), admin.publicKey.toBuffer(), u16(4)], CP);
    send(svm, [
      new TransactionInstruction({ programId: CP, keys: [w(admin.publicKey, true), w(ruleset), r(SystemProgram.programId)], data: Buffer.concat([disc("global:create_ruleset"), u16(4), Buffer.from([4, 0]), partner.toBuffer()]) }),
      new TransactionInstruction({ programId: CP, keys: [w(admin.publicKey, true), r(ruleset), r(NATIVE_MINT), w(collection), r(SystemProgram.programId), r(protocolMint.publicKey)], data: Buffer.concat([disc("global:create_token_collection"), u16(4), u32(100)]) }),
      new TransactionInstruction({ programId: CP, keys: [w(admin.publicKey, true), w(collection), r(ruleset), r(NATIVE_MINT), w(member(NATIVE_MINT)), r(SystemProgram.programId)], data: disc("global:register_collection_member") }),
      new TransactionInstruction({ programId: CP, keys: [w(admin.publicKey, true), w(collection), r(ruleset), r(protocolMint.publicKey), w(member(protocolMint.publicKey)), r(SystemProgram.programId)], data: disc("global:register_collection_member") }),
      // bind protocol/WSOL as the launch multipool (base = protocol token)
      new TransactionInstruction({ programId: CP, keys: [w(admin.publicKey, true), r(pool), r(collection), r(member(protocolMint.publicKey)), w(pda([Buffer.from("pool_members"), pool.toBuffer()], CP)), r(SystemProgram.programId)], data: Buffer.concat([disc("global:init_pool_members"), u64(200)]) }),
    ], [admin]);
    expect(svm.getAccount(pda([Buffer.from("pool_members"), pool.toBuffer()], CP))).to.not.be.null;
  });

  it("init_global + register_quote(WSOL) on the launch program", async () => {
    send(svm, [launchIx("init_global", [w(admin.publicKey, true), w(global), r(partner), r(protocolMint.publicKey), r(SystemProgram.programId)], Buffer.concat([CP.toBuffer(), cpCfg.toBuffer()]))], [admin]);
  });

  it("DBC config with partner = our PDA, 50% liquid partner / 50% locked creator; launch; buy out the curve; Meteora migrates", async () => {
    const baseFee: BaseFee = { cliffFeeNumerator: new BN(2_500_000), firstFactor: 0, secondFactor: new BN(0), thirdFactor: new BN(0), baseFeeMode: 0 };
    const curves = [];
    for (let i = 1; i <= 16; i++) curves.push({ sqrtPrice: i == 16 ? MAX_SQRT_PRICE : MAX_SQRT_PRICE.muln(i * 5).divn(100), liquidity: U64_MAX.shln(30 + i) });
    const instructionParams: ConfigParameters = {
      poolFees: { baseFee, dynamicFee: null }, activationType: 0, collectFeeMode: 0, migrationOption: 1, tokenType: 0, tokenDecimal: 6,
      migrationQuoteThreshold: new BN(LAMPORTS_PER_SOL * 5),
      partnerLiquidityPercentage: 50, partnerPermanentLockedLiquidityPercentage: 0, creatorLiquidityPercentage: 0, creatorPermanentLockedLiquidityPercentage: 50,
      sqrtStartPrice: MIN_SQRT_PRICE.shln(32),
      lockedVesting: { amountPerPeriod: new BN(0), cliffDurationFromMigrationTime: new BN(0), frequency: new BN(0), numberOfPeriod: new BN(0), cliffUnlockAmount: new BN(0) },
      migrationFeeOption: 0, tokenSupply: null, creatorTradingFeePercentage: 0, tokenUpdateAuthority: 0,
      migrationFee: { feePercentage: 0, creatorFeePercentage: 0 }, migratedPoolFee: { collectFeeMode: 0, dynamicFee: 0, poolFeeBps: 0 },
      creatorLiquidityVestingInfo: { vestingPercentage: 0, cliffDurationFromMigrationTime: 0, bpsPerPeriod: 0, numberOfPeriods: 0, frequency: 0 },
      partnerLiquidityVestingInfo: { vestingPercentage: 0, cliffDurationFromMigrationTime: 0, bpsPerPeriod: 0, numberOfPeriods: 0, frequency: 0 },
      poolCreationFee: new BN(0), curve: curves, enableFirstSwapWithMinFee: false, compoundingFeeBps: 0, migratedPoolBaseFeeMode: 0, migratedPoolMarketCapFeeSchedulerParams: null,
    };
    config = await createConfig(svm, program, { payer: admin, leftoverReceiver: partner, feeClaimer: partner, quoteMint: NATIVE_MINT, instructionParams });
    // register the quote on the launch program (validates fee_claimer/leftover == partner)
    const quoteCfg = pda([Buffer.from("quote"), NATIVE_MINT.toBuffer()], LAUNCH);
    send(svm, [launchIx("register_quote", [w(admin.publicKey, true), r(global), r(partner), r(NATIVE_MINT), r(config), r(collection), r(collectionPool), r(pqPool), w(quoteCfg), r(SystemProgram.programId)])], [admin]);
    virtualPool = await createPoolWithSplToken(svm, program, { poolCreator, payer: poolCreator, quoteMint: NATIVE_MINT, config, instructionParams: { name: "Stacc Meme", symbol: "MEME", uri: "https://isotope.exchange/meme.json" } });
    baseMint = getVirtualPool(svm, program, virtualPool).baseMint;
    await swap(svm, program, { config, payer: user, pool: virtualPool, inputTokenMint: NATIVE_MINT, outputTokenMint: baseMint, amountIn: new BN(LAMPORTS_PER_SOL * 5.5), minimumAmountOut: new BN(0), swapMode: SwapMode.PartialFill, referralTokenAccount: null });
    await createMeteoraDammV2Metadata(svm, program, { payer: admin, virtualPool, config });
    const dammConfig = await createDammV2Config(svm, admin, derivePoolAuthority(), 1);
    ({ dammPool, firstPosition, secondPosition } = await migrateToDammV2(svm, program, { payer: admin, virtualPool, dammConfig }));
    const vp = getVirtualPool(svm, program, virtualPool);
    expect(vp.isMigrated).to.eq(1);
  });

  let quoteTotal = 0n, baseTotal = 0n;
  it("crank 1/4 unwind: partner position -> quote + newmeme in partner accounts", async () => {
    const launch = pda([Buffer.from("launch"), virtualPool.toBuffer()], LAUNCH);
    const quoteCfg = pda([Buffer.from("quote"), NATIVE_MINT.toBuffer()], LAUNCH);
    send(svm, [launchIx("init_launch", [w(cranker.publicKey, true), r(quoteCfg), r(virtualPool), r(dammPool), w(launch), r(SystemProgram.programId)])], [cranker]);
    // which of the two positions is the partner's? the one whose NFT sits in a token account owned by `partner`
    const pool = getDammV2Pool(svm, dammPool);
    const candidates = [firstPosition, secondPosition];
    let pos: PublicKey | undefined, nftMint: PublicKey | undefined, nftAcct: PublicKey | undefined;
    for (const p of candidates) {
      const d = Buffer.from(svm.getAccount(p)!.data);
      const mint = new PublicKey(d.subarray(40, 72));
      const acct = derivePositionNftAccount(mint);
      const a = svm.getAccount(acct); if (!a) continue;
      if (new PublicKey(AccountLayout.decode(Buffer.from(a.data)).owner).equals(partner)) { pos = p; nftMint = mint; nftAcct = acct; }
    }
    expect(pos, "partner position").to.not.be.undefined;
    const tokenAMint = new PublicKey(pool.tokenAMint), tokenBMint = new PublicKey(pool.tokenBMint);
    const pa = ata(tokenAMint, partner), pb = ata(tokenBMint, partner);
    send(svm, [
      createAssociatedTokenAccountIdempotentInstruction(cranker.publicKey, pa, partner, tokenAMint),
      createAssociatedTokenAccountIdempotentInstruction(cranker.publicKey, pb, partner, tokenBMint),
      launchIx("unwind", [w(cranker.publicKey, true), r(global), w(partner), w(launch), w(dammPool), w(pos!), w(nftMint!), w(nftAcct!), w(pa), w(pb), w(new PublicKey(pool.tokenAVault)), w(new PublicKey(pool.tokenBVault)), r(tokenAMint), r(tokenBMint), r(TOKEN_PROGRAM_ID), r(TOKEN_PROGRAM_ID), r(TOKEN_2022_PROGRAM_ID), r(deriveDammV2PoolAuthority()), r(deriveDammV2EventAuthority()), r(DAMM_V2_PROGRAM_ID)]),
    ], [cranker]);
    const l = Buffer.from(svm.getAccount(launch)!.data);
    expect(l[9]).to.eq(1, "step Unwound");
    quoteTotal = l.readBigUInt64LE(8 + 1 + 1 + 32 * 5); baseTotal = l.readBigUInt64LE(8 + 1 + 1 + 32 * 5 + 16);
    console.log(`      unwound: ${Number(quoteTotal) / 1e9} SOL, ${Number(baseTotal) / 1e6} MEME`);
    expect(quoteTotal > 0n && baseTotal > 0n).to.eq(true);
    expect(tokenAmount(svm, ata(NATIVE_MINT, partner))).to.eq(quoteTotal);
  });

  const pairAccounts = (a: PublicKey, b: PublicKey) => {
    const { pool, m0, m1 } = cpPool(cpCfg, a, b); const k = cpKeys(pool, m0, m1);
    return [r(CP), r(cpCfg), r(cpAuth), w(pool), r(m0), r(m1), w(k.lp), w(ata(m0, partner)), w(ata(m1, partner)), w(ata(k.lp, partner)), w(k.v0), w(k.v1), w(ata(NATIVE_MINT, admin.publicKey)), w(k.obs), r(TOKEN_PROGRAM_ID), r(TOKEN_PROGRAM_ID), r(TOKEN_PROGRAM_ID), r(ASSOCIATED_TOKEN_PROGRAM_ID), r(SystemProgram.programId), r(SYSVAR_RENT_PUBKEY)];
  };
  it("crank 2/4 pair_quote: MEME/WSOL pool with a third of the quote", async () => {
    const launch = pda([Buffer.from("launch"), virtualPool.toBuffer()], LAUNCH);
    send(svm, [launchIx("pair_quote", [w(cranker.publicKey, true), r(global), w(partner), w(launch), ...pairAccounts(baseMint, NATIVE_MINT)])], [cranker]);
    const { pool } = cpPool(cpCfg, baseMint, NATIVE_MINT);
    expect(svm.getAccount(pool)).to.not.be.null;
    const l = Buffer.from(svm.getAccount(launch)!.data); expect(l[9]).to.eq(2);
    console.log(`      MEME/WSOL pool ${pool.toBase58()} · quote spent ${Number(l.readBigUInt64LE(8 + 2 + 160 + 8)) / 1e9} SOL`);
  });
  const tick = () => { const c = svm.getClock(); c.unixTimestamp = c.unixTimestamp + 5n; svm.setClock(c); warpSlotBy(svm, new BN(10)); };
  it("crank 3/4 pair_protocol: buy protocol token with a third, MEME/PROTO pool", async () => {
    tick();
    const launch = pda([Buffer.from("launch"), virtualPool.toBuffer()], LAUNCH);
    const quoteCfg = pda([Buffer.from("quote"), NATIVE_MINT.toBuffer()], LAUNCH);
    const { m0: q0, m1: q1 } = cpPool(cpCfg, protocolMint.publicKey, NATIVE_MINT); const qk = cpKeys(pqPool, q0, q1);
    const quoteVault = q0.equals(NATIVE_MINT) ? qk.v0 : qk.v1, protoVault = q0.equals(NATIVE_MINT) ? qk.v1 : qk.v0;
    send(svm, [
      createAssociatedTokenAccountIdempotentInstruction(cranker.publicKey, ata(protocolMint.publicKey, partner), partner, protocolMint.publicKey),
      launchIx("pair_protocol", [w(cranker.publicKey, true), r(global), w(partner), w(launch), r(quoteCfg), w(pqPool), r(cpCfg), w(ata(NATIVE_MINT, partner)), w(ata(protocolMint.publicKey, partner)), w(quoteVault), w(protoVault), r(NATIVE_MINT), r(protocolMint.publicKey), r(TOKEN_PROGRAM_ID), r(TOKEN_PROGRAM_ID), w(qk.obs), ...pairAccounts(baseMint, protocolMint.publicKey)]),
    ], [cranker]);
    const { pool } = cpPool(cpCfg, baseMint, protocolMint.publicKey);
    expect(svm.getAccount(pool)).to.not.be.null;
    expect(Buffer.from(svm.getAccount(launch)!.data)[9]).to.eq(3);
    console.log(`      MEME/PROTO pool ${pool.toBase58()}`);
  });
  it("crank 4/4 join_multipool: last third -> MEME via our pool; MEME joins the launch multipool with everything left", async () => {
    tick();
    const launch = pda([Buffer.from("launch"), virtualPool.toBuffer()], LAUNCH);
    const quoteCfg = pda([Buffer.from("quote"), NATIVE_MINT.toBuffer()], LAUNCH);
    const { pool: qp, m0, m1 } = cpPool(cpCfg, baseMint, NATIVE_MINT); const k = cpKeys(qp, m0, m1);
    const qVault = m0.equals(NATIVE_MINT) ? k.v0 : k.v1, bVault = m0.equals(NATIVE_MINT) ? k.v1 : k.v0;
    const poolMembers = pda([Buffer.from("pool_members"), collectionPool.toBuffer()], CP);
    const memberVault = pda([Buffer.from("member_vault"), collectionPool.toBuffer(), baseMint.toBuffer()], CP);
    send(svm, [launchIx("join_multipool", [w(cranker.publicKey, true), r(global), w(partner), w(launch), r(quoteCfg), r(CP), r(cpAuth), w(qp), r(cpCfg), w(ata(NATIVE_MINT, partner)), w(ata(baseMint, partner)), w(qVault), w(bVault), r(NATIVE_MINT), r(baseMint), r(TOKEN_PROGRAM_ID), r(TOKEN_PROGRAM_ID), w(k.obs), w(collection), r(ruleset), w(member(baseMint)), r(virtualPool), r(config), r(collectionPool), w(poolMembers), w(memberVault), r(SystemProgram.programId), r(SYSVAR_RENT_PUBKEY)])], [cranker]);
    expect(Buffer.from(svm.getAccount(launch)!.data)[9]).to.eq(4);
    expect(svm.getAccount(member(baseMint)), "MEME is a collection member").to.not.be.null;
    const pm = Buffer.from(svm.getAccount(poolMembers)!.data);
    expect(pm[10]).to.eq(2, "multipool has 2 members (PROTO base + MEME)");
    const vaultAmt = tokenAmount(svm, memberVault);
    console.log(`      MEME member vault holds ${Number(vaultAmt) / 1e6} MEME · partner MEME left ${tokenAmount(svm, ata(baseMint, partner))} · partner SOL left ${Number(tokenAmount(svm, ata(NATIVE_MINT, partner))) / 1e9}`);
    expect(vaultAmt > 0n).to.eq(true);
    expect(tokenAmount(svm, ata(baseMint, partner))).to.eq(0n, "all newmeme deposited");
    // idempotent: re-running step 4 is refused (WrongStep), and an intra swap PROTO -> MEME works inside the multipool
    let threw = false; try { send(svm, [launchIx("join_multipool", [w(cranker.publicKey, true), r(global), w(partner), w(launch), r(quoteCfg), r(CP), r(cpAuth), w(qp), r(cpCfg), w(ata(NATIVE_MINT, partner)), w(ata(baseMint, partner)), w(qVault), w(bVault), r(NATIVE_MINT), r(baseMint), r(TOKEN_PROGRAM_ID), r(TOKEN_PROGRAM_ID), w(k.obs), w(collection), r(ruleset), w(member(baseMint)), r(virtualPool), r(config), r(collectionPool), w(poolMembers), w(memberVault), r(SystemProgram.programId), r(SYSVAR_RENT_PUBKEY)])], [cranker]); } catch (e: any) { threw = /WrongStep/.test(String(e)); }
    expect(threw, "step 4 twice -> WrongStep").to.eq(true);
    const { m0: c0, m1: c1 } = cpPool(cpCfg, protocolMint.publicKey, NATIVE_MINT); const ck = cpKeys(collectionPool, c0, c1);
    const protoVault = c0.equals(protocolMint.publicKey) ? ck.v0 : ck.v1;
    const memeAta = ata(baseMint, admin.publicKey);
    send(svm, [
      createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, memeAta, admin.publicKey, baseMint),
      new TransactionInstruction({ programId: CP, keys: [r(admin.publicKey, true), r(cpAuth), r(cpCfg), w(collectionPool), w(poolMembers), r(collection), w(ata(protocolMint.publicKey, admin.publicKey)), w(memeAta), w(protoVault), w(memberVault), r(TOKEN_PROGRAM_ID), r(TOKEN_PROGRAM_ID), r(protocolMint.publicKey), r(baseMint), r(protoVault), r(member(protocolMint.publicKey)), r(memberVault), r(member(baseMint))], data: Buffer.concat([disc("global:intra_swap"), Buffer.from([0, 1]), u64(1_000n * 1_000_000n), u64(0)]) }),
    ], [admin]);
    console.log(`      intra_swap 1,000 PROTO -> ${Number(tokenAmount(svm, memeAta)) / 1e6} MEME inside the launch multipool`);
    expect(tokenAmount(svm, memeAta) > 0n).to.eq(true);
  });
});
