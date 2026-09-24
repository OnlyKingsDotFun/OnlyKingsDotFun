// Collection AMM testnet playbook: config -> N-asset pool -> deposit -> swap -> rebalance swap -> withdraw.
// Usage: RPC_URL=https://api.testnet.solana.com node scripts/testnet.mjs [--eight]
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import {
  AddressLookupTableProgram, Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction,
  TransactionMessage, VersionedTransaction, sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction, createMintToInstruction, getAccount, getAssociatedTokenAddressSync, MINT_SIZE,
} from "@solana/spl-token";

const RPC = process.env.RPC_URL ?? "https://api.testnet.solana.com";
const conn = new Connection(RPC, "confirmed");
const kp = (p) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8"))));
const payer = kp(process.env.KEYPAIR ?? `${homedir()}/.config/solana/id.json`);
const PROGRAM_ID = kp("target/deploy/collection_amm-keypair.json").publicKey;
const EXPLORER = (sig) => `https://explorer.solana.com/tx/${sig}?cluster=${RPC.includes("devnet") ? "devnet" : "testnet"}`;
const MAX = 8;

// --- borsh encoders for AmmInstruction ---
const u8 = (v) => Buffer.from([v]);
const u16 = (v) => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; };
const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; };
const u64 = (v) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return b; };
const arr8 = (v) => Buffer.concat(Array.from({ length: MAX }, (_, i) => u64(v[i] ?? 0)));
const ix = {
  createConfig: (index, trade, protocol, fund, divisor) => Buffer.concat([u8(0), u16(index), u64(trade), u64(protocol), u64(fund), u32(divisor)]),
  initPool: (nonce, curve, amp, openTime, rates) => Buffer.concat([u8(3), u64(nonce), u8(curve), u64(amp), u64(openTime), u8(rates.length), arr8(rates)]),
  deposit: (lp, max) => Buffer.concat([u8(4), u64(lp), arr8(max)]),
  withdraw: (lp, min) => Buffer.concat([u8(5), u64(lp), arr8(min)]),
  swap: (i, j, amountIn, minOut) => Buffer.concat([u8(6), u8(i), u8(j), u64(amountIn), u64(minOut)]),
  rebalance: (i, j, amountIn, minOut) => Buffer.concat([u8(7), u8(i), u8(j), u64(amountIn), u64(minOut)]),
};
const pda = (seeds) => PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
const w = (p, isSigner = false) => ({ pubkey: p, isSigner, isWritable: true });
const r = (p) => ({ pubkey: p, isSigner: false, isWritable: false });
const amm = (keys, data) => new TransactionInstruction({ programId: PROGRAM_ID, keys, data });

async function send(label, instructions, signers = [], { expectFail = false, lookupTable } = {}) {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  let tx, raw;
  if (lookupTable) {
    const msg = new TransactionMessage({ payerKey: payer.publicKey, recentBlockhash: blockhash, instructions }).compileToV0Message([lookupTable]);
    tx = new VersionedTransaction(msg);
    tx.sign([payer, ...signers]);
    raw = tx.serialize();
  } else {
    tx = new Transaction({ blockhash, lastValidBlockHeight, feePayer: payer.publicKey }).add(...instructions);
    tx.sign(payer, ...signers);
    raw = tx.serialize({ requireAllSignatures: true });
  }
  const size = raw.length;
  const sizeNote = `${size} bytes (legacy/v0 limit 1232, v1 limit 4096)`;
  try {
    const sig = lookupTable
      ? await conn.sendRawTransaction(raw).then(async (s) => { await conn.confirmTransaction({ signature: s, blockhash, lastValidBlockHeight }); return s; })
      : await sendAndConfirmTransaction(conn, tx, [payer, ...signers]);
    if (expectFail) throw new Error(`${label}: expected failure but succeeded ${sig}`);
    console.log(`✔ ${label} · ${sizeNote}\n    ${EXPLORER(sig)}`);
    return sig;
  } catch (e) {
    if (expectFail) { console.log(`✔ ${label} rejected as expected: ${String(e.message).split("\n")[0].slice(0, 140)}`); return null; }
    throw e;
  }
}

async function createMints(specs) {
  const mints = specs.map(() => Keypair.generate());
  const rent = await conn.getMinimumBalanceForRentExemption(MINT_SIZE);
  const instructions = [];
  const atas = [];
  mints.forEach((m, i) => {
    const ata = getAssociatedTokenAddressSync(m.publicKey, payer.publicKey);
    atas.push(ata);
    instructions.push(
      SystemProgram.createAccount({ fromPubkey: payer.publicKey, newAccountPubkey: m.publicKey, lamports: rent, space: MINT_SIZE, programId: TOKEN_PROGRAM_ID }),
      createInitializeMint2Instruction(m.publicKey, specs[i].decimals, payer.publicKey, null),
      createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, ata, payer.publicKey, m.publicKey),
      createMintToInstruction(m.publicKey, ata, payer.publicKey, BigInt(specs[i].supply)),
    );
  });
  // 4 ixs per mint; batch 3 mints per tx to stay under 1232 bytes.
  for (let i = 0; i < mints.length; i += 3) {
    await send(`create mints ${i}..${Math.min(i + 3, mints.length) - 1}`, instructions.slice(i * 4, (i + 3) * 4), mints.slice(i, i + 3));
  }
  return { mints: mints.map((m) => m.publicKey), atas };
}

const bal = async (ata) => (await getAccount(conn, ata)).amount;

async function playbook(specs, { curve, amp, rates, label, useAlt }) {
  console.log(`\n=== ${label}: ${specs.length}-asset pool ===`);
  const { mints, atas } = await createMints(specs);
  const cfgIndex = Math.floor(Math.random() * 65535);
  const cfg = pda([Buffer.from("amm_config"), payer.publicKey.toBuffer(), u16(cfgIndex)]);
  // 0.25% trade fee, 12% of it to protocol, 4% to fund, rebalance swaps pay fee/100.
  await send("CreateAmmConfig", [amm([w(payer.publicKey, true), w(cfg), r(SystemProgram.programId)], ix.createConfig(cfgIndex, 2500, 120000, 40000, 100))]);

  const nonce = BigInt(Date.now());
  const auth = pda([Buffer.from("vault_and_lp_mint_auth_seed")]);
  const pool = pda([Buffer.from("pool"), cfg.toBuffer(), payer.publicKey.toBuffer(), u64(nonce)]);
  const lpMint = pda([Buffer.from("pool_lp_mint"), pool.toBuffer()]);
  const vaults = mints.map((m) => pda([Buffer.from("pool_vault"), pool.toBuffer(), m.toBuffer()]));
  const userLp = getAssociatedTokenAddressSync(lpMint, payer.publicKey);
  const initKeys = [w(payer.publicKey, true), r(cfg), r(auth), w(pool), w(lpMint), r(TOKEN_PROGRAM_ID), r(SystemProgram.programId), r(TOKEN_PROGRAM_ID), r(TOKEN_2022_PROGRAM_ID)];
  mints.forEach((m, i) => initKeys.push(r(m), w(vaults[i])));
  await send("InitializePool", [
    amm(initKeys, ix.initPool(nonce, curve, amp, 0, rates)),
    createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, userLp, payer.publicKey, lpMint),
  ]);
  console.log(`  pool ${pool.toBase58()}\n  lp mint ${lpMint.toBase58()}`);

  const liqKeys = [w(payer.publicKey, true), r(auth), w(pool), w(lpMint), w(userLp), r(TOKEN_PROGRAM_ID), r(TOKEN_PROGRAM_ID), r(TOKEN_2022_PROGRAM_ID)];
  mints.forEach((m, i) => liqKeys.push(r(m), w(atas[i]), w(vaults[i])));
  const swapKeys = (i, j) => [w(payer.publicKey, true), r(auth), r(cfg), w(pool), r(TOKEN_PROGRAM_ID), r(TOKEN_2022_PROGRAM_ID), r(mints[i]), w(atas[i]), w(vaults[i]), r(mints[j]), w(atas[j]), w(vaults[j])];

  let lookupTable;
  if (useAlt) {
    // Legacy/v0 budget: 32 accounts * 32 bytes already eats 1024 of 1232 bytes. Under transaction v1 (4096 bytes) this
    // deposit fits raw; until then, a lookup table shrinks each address to 1 byte.
    const slot = await conn.getSlot("finalized"); // must be in SlotHashes, so not the current slot
    const [createIx, alt] = AddressLookupTableProgram.createLookupTable({ authority: payer.publicKey, payer: payer.publicKey, recentSlot: slot });
    const addresses = [...new Set(liqKeys.map((k) => k.pubkey.toBase58()))].map((s) => new PublicKey(s));
    // One extend with 27 addresses plus the create ix is 1262 bytes: over the legacy limit on its own.
    await send("create lookup table", [createIx]);
    for (let k = 0; k < addresses.length; k += 20) {
      await send(`extend lookup table ${k}..${Math.min(k + 20, addresses.length) - 1}`, [AddressLookupTableProgram.extendLookupTable({ payer: payer.publicKey, authority: payer.publicKey, lookupTable: alt, addresses: addresses.slice(k, k + 20) })]);
    }
    await new Promise((res) => setTimeout(res, 2000)); // ALT usable one slot after extension
    lookupTable = (await conn.getAddressLookupTable(alt)).value;
  }

  const first = specs.map((s) => s.deposit);
  await send("Deposit (first, sets ratio)", [amm(liqKeys, ix.deposit(0, first))], [], { lookupTable });
  console.log(`  LP balance ${await bal(userLp)}`);

  const [i, j] = [0, specs.length - 1];
  const before = await bal(atas[j]);
  await send(`Swap ${i}->${j} (standard fee)`, [amm(swapKeys(i, j), ix.swap(i, j, specs[i].swap, 0))]);
  console.log(`  received ${(await bal(atas[j])) - before} of token ${j}`);
  await send(`RebalanceSwap ${i}->${j} (same direction, must fail: NotRebalancing)`, [amm(swapKeys(i, j), ix.rebalance(i, j, specs[i].swap / 10n, 0))], [], { expectFail: true });
  const b2 = await bal(atas[i]);
  await send(`RebalanceSwap ${j}->${i} (fee / 100)`, [amm(swapKeys(j, i), ix.rebalance(j, i, specs[j].swap / 2n, 0))]);
  console.log(`  received ${(await bal(atas[i])) - b2} of token ${i}`);
  const lp = await bal(userLp);
  await send("Withdraw half", [amm(liqKeys, ix.withdraw(lp / 2n, specs.map(() => 0)))], [], { lookupTable });
  console.log(`  LP balance ${await bal(userLp)}`);
}

const programInfo = await conn.getAccountInfo(PROGRAM_ID);
if (!programInfo?.executable) {
  console.error(`Program ${PROGRAM_ID.toBase58()} is not deployed on ${RPC}.\nDeploy with:\n  solana program deploy target/deploy/collection_amm.so -u ${RPC} --program-id target/deploy/collection_amm-keypair.json`);
  process.exit(1);
}
console.log(`payer ${payer.publicKey.toBase58()} balance ${(await conn.getBalance(payer.publicKey)) / 1e9} SOL · program ${PROGRAM_ID.toBase58()}`);
const ONE = 1_000_000_000n;
const stable = (decimals) => ({ decimals, supply: 10n ** BigInt(decimals) * 10_000_000n, deposit: 10n ** BigInt(decimals) * 1_000_000n, swap: 10n ** BigInt(decimals) * 10_000n });
await playbook([stable(6), stable(6), stable(9)], { label: "USDC/USDT/DAI stable collection (A=200)", curve: 1, amp: 200, rates: [ONE, ONE, ONE] });
if (process.argv.includes("--eight")) {
  await playbook(Array.from({ length: 8 }, () => stable(6)), { label: "8-asset stable collection (A=500), 32-account deposit via lookup table", curve: 1, amp: 500, rates: Array(8).fill(ONE), useAlt: true });
}
