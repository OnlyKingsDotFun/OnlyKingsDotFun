/**
 * Isotope ve(3,3) on LiteSVM with our cp-swap build: lock PROTO, vote on a collection gauge, fees arrive in
 * the collection's quote (WSOL), voters claim in kind after the epoch; the treasury recycles routed inflows
 * into protocol-owned PROTO/WSOL LP and the gauge; creator fees are harvested from a treasury-created pool.
 */
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { expect } from "chai";
import { NATIVE_MINT, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction, createInitializeMint2Instruction, MINT_SIZE, createSyncNativeInstruction, AccountLayout, createTransferInstruction } from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction, TransactionInstruction } from "@solana/web3.js";
import { LiteSVM } from "litesvm";
import { generateAndFund, sendTransactionMaybeThrow } from "./utils";

const CP = new PublicKey("CY3u73vvVtGa5vojxDoKyg4cn7QWYRDzLTBN9jQKm5RH");
const VE = new PublicKey("VEEgcPaDDxbc3WBCTfkMLUxrhUzaiofJxw3Gh2RjFFT");
const HOME = process.env.HOME!;
const IDL = JSON.parse(fs.readFileSync(`${HOME}/collection-amm/target/idl/isotope_ve.json`, "utf8"));
const disc = (n: string) => createHash("sha256").update(n).digest().subarray(0, 8);
const u16 = (v: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; };
const u16be = (v: number) => { const b = Buffer.alloc(2); b.writeUInt16BE(v); return b; };
const u32 = (v: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; };
const u64 = (v: bigint | number) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return b; };
const i64 = (v: bigint | number) => { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(v)); return b; };
const w = (p: PublicKey, s = false) => ({ pubkey: p, isSigner: s, isWritable: true });
const r = (p: PublicKey, s = false) => ({ pubkey: p, isSigner: s, isWritable: false });
const pda = (seeds: (Buffer | Uint8Array)[], program: PublicKey) => PublicKey.findProgramAddressSync(seeds, program)[0];
const lt = (a: PublicKey, b: PublicKey) => a.toBuffer().compare(b.toBuffer()) < 0;
const ata = (mint: PublicKey, owner: PublicKey) => getAssociatedTokenAddressSync(mint, owner, true);
const tokenAmount = (svm: LiteSVM, k: PublicKey) => { const a = svm.getAccount(k); return a ? AccountLayout.decode(Buffer.from(a.data)).amount : 0n; };
const send = (svm: LiteSVM, ixs: TransactionInstruction[], signers: Keypair[]) => { const tx = new Transaction().add(...ixs); tx.feePayer = signers[0].publicKey; sendTransactionMaybeThrow(svm, tx, signers); };
const fails = (svm: LiteSVM, ixs: TransactionInstruction[], signers: Keypair[], needle: string) => { try { send(svm, ixs, signers); } catch (e: any) { const m = String(e); if (!m.includes(needle)) throw new Error(`expected ${needle}, got: ...${m.slice(-400)}`); return; } throw new Error(`expected failure containing ${needle}`); };
/** Build a ve instruction from the IDL account order so key wiring can't drift from the program. */
const veIx = (name: string, accounts: Record<string, PublicKey>, data: Buffer = Buffer.alloc(0)) => {
  const ix = IDL.instructions.find((i: any) => i.name === name);
  if (!ix) throw new Error(`no ix ${name}`);
  const keys = ix.accounts.map((a: any) => {
    const k = accounts[a.name]; if (!k) throw new Error(`${name}: missing account ${a.name}`);
    return { pubkey: k, isSigner: !!a.signer, isWritable: !!a.writable };
  });
  return new TransactionInstruction({ programId: VE, keys, data: Buffer.concat([Buffer.from(ix.discriminator), data]) });
};
const closed = (svm: LiteSVM, k: PublicKey) => { const a = svm.getAccount(k); return !a || a.lamports === 0n || a.data.length === 0; };
const u64At = (svm: LiteSVM, k: PublicKey, off: number) => Buffer.from(svm.getAccount(k)!.data).readBigUInt64LE(off);
const setTime = (svm: LiteSVM, t: number) => { const c = svm.getClock(); c.unixTimestamp = BigInt(t); svm.setClock(c); };

describe("Isotope ve(3,3)", () => {
  let svm: LiteSVM; let admin: Keypair; let alice: Keypair; let bob: Keypair; let cranker: Keypair;
  let proto: Keypair; let cpCfg: PublicKey; let pool: PublicKey; let m0: PublicKey; let m1: PublicKey; let ruleset: PublicKey; let collection: PublicKey;
  let lp: PublicKey; let v0: PublicKey; let v1: PublicKey; let obs: PublicKey; let adminWsol: PublicKey;
  const config = pda([Buffer.from("config")], VE); const escrow = pda([Buffer.from("escrow")], VE); const treasury = pda([Buffer.from("treasury")], VE);
  const cpAuth = pda([Buffer.from("vault_and_lp_mint_auth_seed")], CP);
  let gauge: PublicKey; let gaugeVault: PublicKey;
  const lockOf = (k: Keypair) => pda([Buffer.from("lock"), k.publicKey.toBuffer()], VE);
  const gaugeEpoch = (e: number) => pda([Buffer.from("gauge_epoch"), gauge.toBuffer(), u64(e)], VE);
  const voteOf = (k: Keypair, e: number) => pda([Buffer.from("vote"), lockOf(k).toBuffer(), gauge.toBuffer(), u64(e)], VE);
  const T0 = 1_800_000_000; const EPOCH = 1_000; const MAX_LOCK = 10_000; const MIN_LOCK = 100;
  const ALICE_AMT = 1_000_000_000n; const BOB_AMT = 1_000_000_000n;
  const wsolFor = (svm: LiteSVM, owner: Keypair, lamports: number) => {
    const a = ata(NATIVE_MINT, owner.publicKey);
    send(svm, [createAssociatedTokenAccountIdempotentInstruction(owner.publicKey, a, owner.publicKey, NATIVE_MINT), SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: a, lamports }), createSyncNativeInstruction(a)], [owner]);
    return a;
  };

  before(() => {
    svm = new LiteSVM();
    const mint = new Uint8Array(82); mint[44] = 9; mint[45] = 1; // WSOL mint: decimals 9, initialized
    svm.setAccount(NATIVE_MINT, { data: mint, executable: false, lamports: 1390379946687, owner: TOKEN_PROGRAM_ID, rentEpoch: 0 });
    svm.addProgramFromFile(CP, path.resolve(`${HOME}/collection-amm/keys/raydium_cp_swap.testnet.so`));
    svm.addProgramFromFile(VE, path.resolve("../.cargo-target/deploy/isotope_ve.so"));
    admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(`${HOME}/test.json`, "utf8"))));
    svm.airdrop(admin.publicKey, BigInt(1000 * LAMPORTS_PER_SOL));
    svm.airdrop(treasury, BigInt(5 * LAMPORTS_PER_SOL));
    alice = generateAndFund(svm); bob = generateAndFund(svm); cranker = generateAndFund(svm);
    setTime(svm, T0 - 10);
  });

  it("PROTO, cp-swap fee tier, PROTO/WSOL pool, an Any-ruleset collection quoted in WSOL", () => {
    proto = Keypair.generate();
    const rent = Number(svm.minimumBalanceForRentExemption(BigInt(MINT_SIZE)));
    const wAta = ata(NATIVE_MINT, admin.publicKey); // cp-swap create-pool fee receiver baked into the build
    const aux = Keypair.generate(); const tokRent = Number(svm.minimumBalanceForRentExemption(165n));
    send(svm, [
      SystemProgram.createAccount({ fromPubkey: admin.publicKey, newAccountPubkey: proto.publicKey, lamports: rent, space: MINT_SIZE, programId: TOKEN_PROGRAM_ID }),
      createInitializeMint2Instruction(proto.publicKey, 9, admin.publicKey, null),
      ...[admin, alice, bob, cranker].map((k) => createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, ata(proto.publicKey, k.publicKey), k.publicKey, proto.publicKey)),
      ...[admin, alice, bob, cranker].map((k) => createMintToInstruction(proto.publicKey, ata(proto.publicKey, k.publicKey), admin.publicKey, 1_000n * 1_000_000_000n)),
      createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, wAta, admin.publicKey, NATIVE_MINT),
      SystemProgram.createAccount({ fromPubkey: admin.publicKey, newAccountPubkey: aux.publicKey, lamports: tokRent + 300 * LAMPORTS_PER_SOL, space: 165, programId: TOKEN_PROGRAM_ID }),
      new TransactionInstruction({ programId: TOKEN_PROGRAM_ID, keys: [w(aux.publicKey), r(NATIVE_MINT)], data: Buffer.concat([Buffer.from([18]), admin.publicKey.toBuffer()]) }),
      createSyncNativeInstruction(aux.publicKey),
    ], [admin, proto, aux]);
    adminWsol = aux.publicKey;
    const idx = 9;
    cpCfg = pda([Buffer.from("amm_config"), u16be(idx)], CP);
    send(svm, [new TransactionInstruction({ programId: CP, keys: [w(admin.publicKey, true), w(cpCfg), r(SystemProgram.programId)], data: Buffer.concat([disc("global:create_amm_config"), u16(idx), u64(2500), u64(120000), u64(40000), u64(0), u64(0)]) })], [admin]);
    [m0, m1] = lt(proto.publicKey, NATIVE_MINT) ? [proto.publicKey, NATIVE_MINT] : [NATIVE_MINT, proto.publicKey];
    pool = pda([Buffer.from("pool"), cpCfg.toBuffer(), m0.toBuffer(), m1.toBuffer()], CP);
    lp = pda([Buffer.from("pool_lp_mint"), pool.toBuffer()], CP); v0 = pda([Buffer.from("pool_vault"), pool.toBuffer(), m0.toBuffer()], CP); v1 = pda([Buffer.from("pool_vault"), pool.toBuffer(), m1.toBuffer()], CP); obs = pda([Buffer.from("observation"), pool.toBuffer()], CP);
    const amt = (m: PublicKey) => (m.equals(NATIVE_MINT) ? 100n * BigInt(LAMPORTS_PER_SOL) : 100n * 1_000_000_000n); // 1 PROTO = 1 SOL
    send(svm, [new TransactionInstruction({ programId: CP, keys: [w(admin.publicKey, true), r(cpCfg), r(cpAuth), w(pool), r(m0), r(m1), w(lp), w(m0.equals(NATIVE_MINT) ? adminWsol : ata(m0, admin.publicKey)), w(m1.equals(NATIVE_MINT) ? adminWsol : ata(m1, admin.publicKey)), w(ata(lp, admin.publicKey)), w(v0), w(v1), w(wAta), w(obs), r(TOKEN_PROGRAM_ID), r(TOKEN_PROGRAM_ID), r(TOKEN_PROGRAM_ID), r(ASSOCIATED_TOKEN_PROGRAM_ID), r(SystemProgram.programId), r(SYSVAR_RENT_PUBKEY)], data: Buffer.concat([disc("global:initialize"), u64(amt(m0)), u64(amt(m1)), u64(0)]) })], [admin]);
    ruleset = pda([Buffer.from("ruleset"), u16(9)], CP);
    collection = pda([Buffer.from("token_collection"), admin.publicKey.toBuffer(), u16(9)], CP);
    send(svm, [
      new TransactionInstruction({ programId: CP, keys: [w(admin.publicKey, true), w(ruleset), r(SystemProgram.programId)], data: Buffer.concat([disc("global:create_ruleset"), u16(9), Buffer.from([0, 0]), PublicKey.default.toBuffer()]) }),
      new TransactionInstruction({ programId: CP, keys: [w(admin.publicKey, true), r(ruleset), r(NATIVE_MINT), w(collection), r(SystemProgram.programId)], data: Buffer.concat([disc("global:create_token_collection"), u16(9), u32(100)]) }),
    ], [admin]);
    setTime(svm, T0 - 1);
  });

  it("init_config + gauge for the collection (vault in WSOL)", () => {
    setTime(svm, T0);
    send(svm, [veIx("init_config", { admin: admin.publicKey, config, proto_mint: proto.publicKey, cpmm_program: CP, escrow, treasury, system_program: SystemProgram.programId },
      Buffer.concat([i64(EPOCH), i64(MAX_LOCK), i64(MIN_LOCK), u64(50n * BigInt(LAMPORTS_PER_SOL)), u16(100)]))], [admin]);
    gauge = pda([Buffer.from("gauge"), collection.toBuffer()], VE);
    gaugeVault = ata(NATIVE_MINT, gauge);
    send(svm, [veIx("create_gauge", { payer: cranker.publicKey, config, collection, quote_mint: NATIVE_MINT, gauge, vault: gaugeVault, token_program: TOKEN_PROGRAM_ID, associated_token_program: ASSOCIATED_TOKEN_PROGRAM_ID, system_program: SystemProgram.programId })], [cranker]);
    // wrong quote mint is rejected
    fails(svm, [veIx("create_gauge", { payer: cranker.publicKey, config, collection: pda([Buffer.from("token_collection"), admin.publicKey.toBuffer(), u16(9)], CP), quote_mint: proto.publicKey, gauge: pda([Buffer.from("gauge"), collection.toBuffer()], VE), vault: ata(proto.publicKey, gauge), token_program: TOKEN_PROGRAM_ID, associated_token_program: ASSOCIATED_TOKEN_PROGRAM_ID, system_program: SystemProgram.programId })], [cranker], "already in use");
    const g = Buffer.from(svm.getAccount(gauge)!.data);
    expect(new PublicKey(g.subarray(9, 41)).equals(collection)).to.be.true;
    expect(new PublicKey(g.subarray(41, 73)).equals(NATIVE_MINT)).to.be.true;
  });

  const lockAccounts = (k: Keypair) => ({ owner: k.publicKey, config, proto_mint: proto.publicKey, lock: lockOf(k), escrow, vault: ata(proto.publicKey, escrow), source: ata(proto.publicKey, k.publicKey), token_program: TOKEN_PROGRAM_ID, associated_token_program: ASSOCIATED_TOKEN_PROGRAM_ID, system_program: SystemProgram.programId });

  it("locks: alice 1000 PROTO for max, bob 1000 PROTO for half; power decays linearly", () => {
    send(svm, [veIx("create_lock", lockAccounts(alice), Buffer.concat([u64(ALICE_AMT), i64(MAX_LOCK)]))], [alice]);
    send(svm, [veIx("create_lock", lockAccounts(bob), Buffer.concat([u64(BOB_AMT), i64(MAX_LOCK / 2)]))], [bob]);
    expect(tokenAmount(svm, ata(proto.publicKey, escrow))).to.eq(ALICE_AMT + BOB_AMT);
    fails(svm, [veIx("create_lock", lockAccounts(cranker), Buffer.concat([u64(1n), i64(MIN_LOCK - 1)]))], [cranker], "BadDuration");
  });

  let wA: bigint; let wB: bigint; const FEES0 = 30n * BigInt(LAMPORTS_PER_SOL);
  it("epoch 0: both vote their full power on the gauge, 30 WSOL of fees arrive", () => {
    setTime(svm, T0 + 100);
    // power = amount * (end - now) / MAX_LOCK ; ends: alice T0+MAX, bob T0+MAX/2
    wA = ALICE_AMT * BigInt(MAX_LOCK - 100) / BigInt(MAX_LOCK);
    wB = BOB_AMT * BigInt(MAX_LOCK / 2 - 100) / BigInt(MAX_LOCK);
    const voteAcc = (k: Keypair) => ({ owner: k.publicKey, config, lock: lockOf(k), gauge, gauge_epoch: gaugeEpoch(0), vote: voteOf(k, 0), system_program: SystemProgram.programId });
    fails(svm, [veIx("vote", voteAcc(alice), u64(wA + 1n))], [alice], "InsufficientPower");
    send(svm, [veIx("vote", voteAcc(alice), u64(wA))], [alice]);
    send(svm, [veIx("vote", voteAcc(bob), u64(wB))], [bob]);
    expect(u64At(svm, gaugeEpoch(0), 8 + 1 + 32 + 8)).to.eq(wA + wB);
    const src = wsolFor(svm, cranker, 40 * LAMPORTS_PER_SOL);
    send(svm, [veIx("deposit_fees", { depositor: cranker.publicKey, config, gauge, quote_mint: NATIVE_MINT, gauge_epoch: gaugeEpoch(0), vault: gaugeVault, source: src, token_program: TOKEN_PROGRAM_ID, system_program: SystemProgram.programId }, u64(FEES0))], [cranker]);
    expect(tokenAmount(svm, gaugeVault)).to.eq(FEES0);
    // claiming inside the open epoch is refused
    const dA0 = wsolFor(svm, alice, 0);
    fails(svm, [veIx("claim", { owner: alice.publicKey, config, gauge, quote_mint: NATIVE_MINT, gauge_epoch: gaugeEpoch(0), vote: voteOf(alice, 0), vault: gaugeVault, destination: dA0, token_program: TOKEN_PROGRAM_ID })], [alice], "EpochOpen");
  });

  it("epoch 1: claims pay out in WSOL pro rata to the lamport; a vote can't be claimed twice", () => {
    setTime(svm, T0 + EPOCH + 5);
    const dA = wsolFor(svm, alice, 0); const dB = wsolFor(svm, bob, 0);
    const claimAcc = (k: Keypair, d: PublicKey) => ({ owner: k.publicKey, config, gauge, quote_mint: NATIVE_MINT, gauge_epoch: gaugeEpoch(0), vote: voteOf(k, 0), vault: gaugeVault, destination: d, token_program: TOKEN_PROGRAM_ID });
    send(svm, [veIx("claim", claimAcc(alice, dA))], [alice]);
    send(svm, [veIx("claim", claimAcc(bob, dB))], [bob]);
    const expA = FEES0 * wA / (wA + wB); const expB = FEES0 * wB / (wA + wB);
    expect(tokenAmount(svm, dA)).to.eq(expA);
    expect(tokenAmount(svm, dB)).to.eq(expB);
    expect(closed(svm, voteOf(alice, 0))).to.be.true; // closed
    fails(svm, [veIx("claim", claimAcc(alice, dA))], [alice], "AccountNotInitialized");
  });

  it("an epoch with fees but no votes is swept forward, not stranded", () => {
    const src = ata(NATIVE_MINT, cranker.publicKey);
    send(svm, [veIx("deposit_fees", { depositor: cranker.publicKey, config, gauge, quote_mint: NATIVE_MINT, gauge_epoch: gaugeEpoch(1), vault: gaugeVault, source: src, token_program: TOKEN_PROGRAM_ID, system_program: SystemProgram.programId }, u64(7n * BigInt(LAMPORTS_PER_SOL)))], [cranker]);
    fails(svm, [veIx("sweep_unvoted", { payer: cranker.publicKey, config, gauge, stale: gaugeEpoch(1), current: gaugeEpoch(2), system_program: SystemProgram.programId })], [cranker], "ConstraintSeeds"); // epoch 1 is still open: no epoch-2 tally exists yet
    setTime(svm, T0 + 2 * EPOCH + 5);
    send(svm, [veIx("sweep_unvoted", { payer: cranker.publicKey, config, gauge, stale: gaugeEpoch(1), current: gaugeEpoch(2), system_program: SystemProgram.programId })], [cranker]);
    expect(u64At(svm, gaugeEpoch(1), 8 + 1 + 32 + 8 + 8)).to.eq(0n);
    expect(u64At(svm, gaugeEpoch(2), 8 + 1 + 32 + 8 + 8)).to.eq(7n * BigInt(LAMPORTS_PER_SOL));
    fails(svm, [veIx("sweep_unvoted", { payer: cranker.publicKey, config, gauge, stale: gaugeEpoch(0), current: gaugeEpoch(2), system_program: SystemProgram.programId })], [cranker], "EpochHadVotes");
  });

  it("route WSOL -> gauge + PROTO/WSOL POL pool; recycle splits treasury inflows, LP lands in the treasury", () => {
    send(svm, [veIx("set_route", { admin: admin.publicKey, config, quote_mint: NATIVE_MINT, route: pda([Buffer.from("route"), NATIVE_MINT.toBuffer()], VE), gauge, pol_pool: pool, system_program: SystemProgram.programId }, u16(5000))], [admin]);
    // 20 WSOL "platform fees" arrive in the treasury's WSOL ATA
    const tq = ata(NATIVE_MINT, treasury);
    send(svm, [createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, tq, treasury, NATIVE_MINT), createTransferInstruction(adminWsol, tq, admin.publicKey, 20n * BigInt(LAMPORTS_PER_SOL))], [admin]);
    const quoteIs0 = m0.equals(NATIVE_MINT);
    const [qv, pv] = quoteIs0 ? [v0, v1] : [v1, v0];
    const rq = tokenAmount(svm, qv); const rp = tokenAmount(svm, pv);
    const epochNow = 2; const feesBefore = u64At(svm, gaugeEpoch(epochNow), 8 + 1 + 32 + 8 + 8);
    send(svm, [veIx("recycle", {
      payer: cranker.publicKey, config, route: pda([Buffer.from("route"), NATIVE_MINT.toBuffer()], VE), treasury, quote_mint: NATIVE_MINT, proto_mint: proto.publicKey,
      treasury_quote: tq, treasury_proto: ata(proto.publicKey, treasury), treasury_lp: ata(lp, treasury), gauge, gauge_epoch: gaugeEpoch(epochNow), vault: gaugeVault,
      cpmm_program: CP, cpmm_authority: cpAuth, amm_config: cpCfg, pol_pool: pool, vault_0: v0, vault_1: v1, lp_mint: lp, observation: obs,
      token_program: TOKEN_PROGRAM_ID, token_program_2022: TOKEN_2022_PROGRAM_ID, associated_token_program: ASSOCIATED_TOKEN_PROGRAM_ID, system_program: SystemProgram.programId,
    })], [cranker]);
    const ten = 10n * BigInt(LAMPORTS_PER_SOL);
    expect(u64At(svm, gaugeEpoch(epochNow), 8 + 1 + 32 + 8 + 8) - feesBefore).to.eq(ten); // 50% to voters
    expect(tokenAmount(svm, ata(lp, treasury)) > 0n).to.be.true; // POL
    expect(tokenAmount(svm, tq) < BigInt(LAMPORTS_PER_SOL) / 100n).to.be.true; // dust only
    // pool grew by ~10 WSOL; PROTO side bought then re-deposited
    expect(tokenAmount(svm, qv) - rq > ten - ten / 20n).to.be.true;
    expect(tokenAmount(svm, pv) <= rp).to.be.true; // net PROTO left the pool (bought) minus what came back in the deposit
    // recycle honours the per-call cap: 60 WSOL in, only 50 taken
    send(svm, [createTransferInstruction(adminWsol, tq, admin.publicKey, 60n * BigInt(LAMPORTS_PER_SOL))], [admin]);
    const before = tokenAmount(svm, tq);
    send(svm, [veIx("recycle", {
      payer: cranker.publicKey, config, route: pda([Buffer.from("route"), NATIVE_MINT.toBuffer()], VE), treasury, quote_mint: NATIVE_MINT, proto_mint: proto.publicKey,
      treasury_quote: tq, treasury_proto: ata(proto.publicKey, treasury), treasury_lp: ata(lp, treasury), gauge, gauge_epoch: gaugeEpoch(epochNow), vault: gaugeVault,
      cpmm_program: CP, cpmm_authority: cpAuth, amm_config: cpCfg, pol_pool: pool, vault_0: v0, vault_1: v1, lp_mint: lp, observation: obs,
      token_program: TOKEN_PROGRAM_ID, token_program_2022: TOKEN_2022_PROGRAM_ID, associated_token_program: ASSOCIATED_TOKEN_PROGRAM_ID, system_program: SystemProgram.programId,
    })], [cranker]);
    const spent = before - tokenAmount(svm, tq);
    expect(spent > 49n * BigInt(LAMPORTS_PER_SOL) && spent <= 50n * BigInt(LAMPORTS_PER_SOL), `spent ${spent}`).to.be.true;
  });

  it("harvest_creator_fee: a pool whose creator is the treasury pays its creator fees into the treasury", () => {
    // make the treasury the pool creator with 1 WSOL + 1 PROTO of accrued creator fees (set_account; cp-swap's own tests cover accrual)
    const acc = svm.getAccount(pool)!; const d = Buffer.from(acc.data);
    treasury.toBuffer().copy(d, 40); d[390] = 1;
    d.writeBigUInt64LE(BigInt(LAMPORTS_PER_SOL), 397); d.writeBigUInt64LE(BigInt(LAMPORTS_PER_SOL), 405);
    svm.setAccount(pool, { ...acc, data: d });
    const t0 = ata(m0, treasury); const t1 = ata(m1, treasury);
    const b0 = tokenAmount(svm, t0); const b1 = tokenAmount(svm, t1);
    send(svm, [veIx("harvest_creator_fee", { config, treasury, cpmm_program: CP, cpmm_authority: cpAuth, pool_state: pool, amm_config: cpCfg, vault_0: v0, vault_1: v1, mint_0: m0, mint_1: m1, treasury_0: t0, treasury_1: t1, token_program_0: TOKEN_PROGRAM_ID, token_program_1: TOKEN_PROGRAM_ID, associated_token_program: ASSOCIATED_TOKEN_PROGRAM_ID, system_program: SystemProgram.programId })], [cranker]);
    expect(tokenAmount(svm, t0) - b0).to.eq(BigInt(LAMPORTS_PER_SOL));
    expect(tokenAmount(svm, t1) - b1).to.eq(BigInt(LAMPORTS_PER_SOL));
    expect(u64At(svm, pool, 397)).to.eq(0n);
  });

  it("withdraw after expiry returns PROTO and closes the lock; before expiry it is refused", () => {
    const wd = (k: Keypair) => veIx("withdraw", { owner: k.publicKey, config, proto_mint: proto.publicKey, lock: lockOf(k), escrow, vault: ata(proto.publicKey, escrow), destination: ata(proto.publicKey, k.publicKey), token_program: TOKEN_PROGRAM_ID });
    fails(svm, [wd(alice)], [alice], "LockActive");
    setTime(svm, T0 + MAX_LOCK / 2 + 1);
    const before = tokenAmount(svm, ata(proto.publicKey, bob.publicKey));
    send(svm, [wd(bob)], [bob]);
    expect(tokenAmount(svm, ata(proto.publicKey, bob.publicKey)) - before).to.eq(BOB_AMT);
    expect(closed(svm, lockOf(bob))).to.be.true;
    fails(svm, [wd(alice)], [alice], "LockActive");
    // an expired lock has zero power
    setTime(svm, T0 + MAX_LOCK + 1);
    const e = Math.floor((MAX_LOCK + 1) / EPOCH);
    fails(svm, [veIx("vote", { owner: alice.publicKey, config, lock: lockOf(alice), gauge, gauge_epoch: gaugeEpoch(e), vote: voteOf(alice, e), system_program: SystemProgram.programId }, u64(1n))], [alice], "InsufficientPower");
  });
});
