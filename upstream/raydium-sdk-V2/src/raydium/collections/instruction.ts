import BN from "bn.js";
import { AccountMeta, PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { MEMO_PROGRAM_ID, RENT_PROGRAM_ID } from "@/common";
import { struct, u8, u16, u32, u64, u128, bool, publicKey } from "@/marshmallow";
import { getPdaRuleset, getPdaTokenCollection, getPdaCollectionMember, getPdaPoolMembers, getPdaMemberVault } from "./pda";

/** Anchor discriminators, sha256("global:<name>")[..8]. Identical in cp-swap and clmm. */
export const collectionsAnchorData = {
  createRuleset: Buffer.from([123, 244, 242, 133, 232, 203, 73, 198]),
  updateRuleset: Buffer.from([163, 247, 48, 173, 18, 174, 20, 154]),
  createTokenCollection: Buffer.from([220, 140, 46, 36, 208, 163, 6, 3]),
  updateTokenCollection: Buffer.from([143, 109, 74, 159, 45, 144, 212, 130]),
  registerCollectionMember: Buffer.from([189, 156, 113, 17, 73, 63, 122, 111]),
  setCollectionMemberRate: Buffer.from([242, 103, 47, 43, 47, 18, 165, 89]),
  syncMemberRate: Buffer.from([6, 238, 69, 134, 112, 107, 139, 134]),
  rebalanceSwapBaseInput: Buffer.from([225, 152, 65, 52, 41, 220, 94, 58]),
  rebalanceSwapV2: Buffer.from([207, 89, 69, 210, 43, 7, 24, 161]),
  initPoolMembers: Buffer.from([200, 250, 247, 64, 69, 215, 172, 190]),
  addPoolMember: Buffer.from([146, 14, 31, 156, 101, 69, 133, 52]),
  intraSwap: Buffer.from([121, 230, 156, 108, 237, 159, 76, 99]),
  collectMemberFees: Buffer.from([158, 164, 140, 125, 67, 248, 105, 209]),
};

const w = (pubkey: PublicKey, isSigner = false): AccountMeta => ({ pubkey, isSigner, isWritable: true });
const r = (pubkey: PublicKey, isSigner = false): AccountMeta => ({ pubkey, isSigner, isWritable: false });

export function makeCreateRulesetInstruction(
  programId: PublicKey,
  admin: PublicKey,
  index: number,
  kind: number,
  flags: number,
  ruleProgramId: PublicKey,
): TransactionInstruction {
  const layout = struct([u16("index"), u8("kind"), u8("flags"), publicKey("programId")]);
  const data = Buffer.alloc(layout.span);
  layout.encode({ index, kind, flags, programId: ruleProgramId }, data);
  return new TransactionInstruction({
    programId,
    keys: [w(admin, true), w(getPdaRuleset(programId, index).publicKey), r(SystemProgram.programId)],
    data: Buffer.concat([collectionsAnchorData.createRuleset, data]),
  });
}

export function makeUpdateRulesetInstruction(
  programId: PublicKey,
  admin: PublicKey,
  ruleset: PublicKey,
  kind: number,
  flags: number,
  ruleProgramId: PublicKey,
): TransactionInstruction {
  const layout = struct([u8("kind"), u8("flags"), publicKey("programId")]);
  const data = Buffer.alloc(layout.span);
  layout.encode({ kind, flags, programId: ruleProgramId }, data);
  return new TransactionInstruction({
    programId,
    keys: [r(admin, true), w(ruleset)],
    data: Buffer.concat([collectionsAnchorData.updateRuleset, data]),
  });
}

export function makeCreateTokenCollectionInstruction(
  programId: PublicKey,
  authority: PublicKey,
  ruleset: PublicKey,
  quoteMint: PublicKey,
  index: number,
  rebalanceFeeDivisor: number,
): TransactionInstruction {
  const layout = struct([u16("index"), u32("rebalanceFeeDivisor")]);
  const data = Buffer.alloc(layout.span);
  layout.encode({ index, rebalanceFeeDivisor }, data);
  return new TransactionInstruction({
    programId,
    keys: [
      w(authority, true),
      r(ruleset),
      r(quoteMint),
      w(getPdaTokenCollection(programId, authority, index).publicKey),
      r(SystemProgram.programId),
    ],
    data: Buffer.concat([collectionsAnchorData.createTokenCollection, data]),
  });
}

/** param 0: rebalance fee divisor (value), param 1: new authority (remaining account). */
export function makeUpdateTokenCollectionInstruction(
  programId: PublicKey,
  authority: PublicKey,
  collection: PublicKey,
  param: 0 | 1,
  value: BN | number,
  newAuthority?: PublicKey,
): TransactionInstruction {
  const layout = struct([u8("param"), u64("value")]);
  const data = Buffer.alloc(layout.span);
  layout.encode({ param, value: new BN(value) }, data);
  const keys = [r(authority, true), w(collection)];
  if (newAuthority) keys.push(r(newAuthority));
  return new TransactionInstruction({ programId, keys, data: Buffer.concat([collectionsAnchorData.updateTokenCollection, data]) });
}

/** `proof` is the rule's proof account(s): pump.fun bonding curve, stake pool, or nothing. */
export function makeRegisterCollectionMemberInstruction(
  programId: PublicKey,
  payer: PublicKey,
  collection: PublicKey,
  ruleset: PublicKey,
  mint: PublicKey,
  proof: PublicKey[] = [],
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [
      w(payer, true),
      w(collection),
      r(ruleset),
      r(mint),
      w(getPdaCollectionMember(programId, collection, mint).publicKey),
      r(SystemProgram.programId),
      ...proof.map((p) => r(p)),
    ],
    data: collectionsAnchorData.registerCollectionMember,
  });
}

export function makeSetCollectionMemberRateInstruction(
  programId: PublicKey,
  authority: PublicKey,
  collection: PublicKey,
  member: PublicKey,
  rate: BN,
): TransactionInstruction {
  const layout = struct([u64("rate")]);
  const data = Buffer.alloc(layout.span);
  layout.encode({ rate }, data);
  return new TransactionInstruction({
    programId,
    keys: [r(authority, true), r(collection), w(member)],
    data: Buffer.concat([collectionsAnchorData.setCollectionMemberRate, data]),
  });
}

/** Permissionless, no signer: re-read an LST member's rate from its stake pool. */
export function makeSyncMemberRateInstruction(
  programId: PublicKey,
  collection: PublicKey,
  ruleset: PublicKey,
  member: PublicKey,
  stakePool: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [r(collection), r(ruleset), w(member), r(stakePool)],
    data: collectionsAnchorData.syncMemberRate,
  });
}

export function makeInitPoolMembersInstruction(
  programId: PublicKey,
  payer: PublicKey,
  poolId: PublicKey,
  collection: PublicKey,
  baseMint: PublicKey,
  amp: BN | number,
): TransactionInstruction {
  const layout = struct([u64("amp")]);
  const data = Buffer.alloc(layout.span);
  layout.encode({ amp: new BN(amp) }, data);
  return new TransactionInstruction({
    programId,
    keys: [
      w(payer, true),
      r(poolId),
      r(collection),
      r(getPdaCollectionMember(programId, collection, baseMint).publicKey),
      w(getPdaPoolMembers(programId, poolId).publicKey),
      r(SystemProgram.programId),
    ],
    data: Buffer.concat([collectionsAnchorData.initPoolMembers, data]),
  });
}

/** cp-swap variant takes the pool authority PDA and rent; clmm variant does not. */
export function makeAddPoolMemberInstruction(
  programId: PublicKey,
  payer: PublicKey,
  poolId: PublicKey,
  collection: PublicKey,
  mint: PublicKey,
  mintProgram: PublicKey,
  opts: { amm: "cpmm"; authority: PublicKey } | { amm: "clmm" },
): TransactionInstruction {
  const member = getPdaCollectionMember(programId, collection, mint).publicKey;
  const poolMembers = getPdaPoolMembers(programId, poolId).publicKey;
  const vault = getPdaMemberVault(programId, poolId, mint).publicKey;
  const keys =
    opts.amm === "cpmm"
      ? [w(payer, true), r(opts.authority), r(poolId), w(poolMembers), r(member), r(mint), w(vault), r(mintProgram), r(SystemProgram.programId), r(RENT_PROGRAM_ID)]
      : [w(payer, true), r(poolId), w(poolMembers), r(member), r(mint), w(vault), r(mintProgram), r(SystemProgram.programId)];
  return new TransactionInstruction({ programId, keys, data: collectionsAnchorData.addPoolMember });
}

export interface IntraSwapMember {
  mint: PublicKey;
  vault: PublicKey;
  /** token program owning the mint */
  mintProgram: PublicKey;
}

/**
 * Swap member `fromIndex` for member `toIndex` inside a collection pool.
 * `members` must be the pool's full member list in index order (0 = base).
 */
export function makeIntraSwapInstruction(
  programId: PublicKey,
  owner: PublicKey,
  poolId: PublicKey,
  ammConfigId: PublicKey,
  collection: PublicKey,
  members: IntraSwapMember[],
  userInputAccount: PublicKey,
  userOutputAccount: PublicKey,
  fromIndex: number,
  toIndex: number,
  amountIn: BN,
  minimumAmountOut: BN,
  opts: { amm: "cpmm"; authority: PublicKey } | { amm: "clmm" },
): TransactionInstruction {
  const layout = struct([u8("from"), u8("to"), u64("amountIn"), u64("minimumAmountOut")]);
  const data = Buffer.alloc(layout.span);
  layout.encode({ from: fromIndex, to: toIndex, amountIn, minimumAmountOut }, data);
  const poolMembers = getPdaPoolMembers(programId, poolId).publicKey;
  const i = members[fromIndex];
  const j = members[toIndex];
  const head =
    opts.amm === "cpmm"
      ? [r(owner, true), r(opts.authority), r(ammConfigId), w(poolId), w(poolMembers), r(collection), w(userInputAccount), w(userOutputAccount), w(i.vault), w(j.vault), r(i.mintProgram), r(j.mintProgram), r(i.mint), r(j.mint)]
      : [r(owner, true), r(ammConfigId), w(poolId), w(poolMembers), r(collection), w(userInputAccount), w(userOutputAccount), w(i.vault), w(j.vault), r(TOKEN_PROGRAM_ID), r(TOKEN_2022_PROGRAM_ID), r(i.mint), r(j.mint)];
  const remaining: AccountMeta[] = [];
  for (const m of members) remaining.push(r(m.vault), r(getPdaCollectionMember(programId, collection, m.mint).publicKey));
  return new TransactionInstruction({ programId, keys: [...head, ...remaining], data: Buffer.concat([collectionsAnchorData.intraSwap, data]) });
}

/** kind 0: protocol fees, kind 1: fund fees, from a non-base member vault. */
export function makeCollectMemberFeesInstruction(
  programId: PublicKey,
  owner: PublicKey,
  poolId: PublicKey,
  ammConfigId: PublicKey,
  memberIndex: number,
  memberMint: PublicKey,
  recipientTokenAccount: PublicKey,
  kind: 0 | 1,
  opts: { amm: "cpmm"; authority: PublicKey; mintProgram: PublicKey } | { amm: "clmm" },
): TransactionInstruction {
  const layout = struct([u8("memberIndex"), u8("kind")]);
  const data = Buffer.alloc(layout.span);
  layout.encode({ memberIndex, kind }, data);
  const poolMembers = getPdaPoolMembers(programId, poolId).publicKey;
  const vault = getPdaMemberVault(programId, poolId, memberMint).publicKey;
  const keys =
    opts.amm === "cpmm"
      ? [r(owner, true), r(opts.authority), r(ammConfigId), r(poolId), w(poolMembers), w(vault), w(recipientTokenAccount), r(memberMint), r(opts.mintProgram)]
      : [r(owner, true), r(ammConfigId), w(poolId), w(poolMembers), w(vault), w(recipientTokenAccount), r(memberMint), r(TOKEN_PROGRAM_ID), r(TOKEN_2022_PROGRAM_ID)];
  return new TransactionInstruction({ programId, keys, data: Buffer.concat([collectionsAnchorData.collectMemberFees, data]) });
}

/** cp-swap `rebalance_swap_base_input`: the standard swap accounts + collection + both members. */
export function makeRebalanceSwapCpmmInstruction(
  programId: PublicKey,
  swapKeys: AccountMeta[],
  collection: PublicKey,
  inputMint: PublicKey,
  outputMint: PublicKey,
  amountIn: BN,
  minimumAmountOut: BN,
): TransactionInstruction {
  const layout = struct([u64("amountIn"), u64("minimumAmountOut")]);
  const data = Buffer.alloc(layout.span);
  layout.encode({ amountIn, minimumAmountOut }, data);
  return new TransactionInstruction({
    programId,
    keys: [
      ...swapKeys,
      r(collection),
      r(getPdaCollectionMember(programId, collection, inputMint).publicKey),
      r(getPdaCollectionMember(programId, collection, outputMint).publicKey),
    ],
    data: Buffer.concat([collectionsAnchorData.rebalanceSwapBaseInput, data]),
  });
}

/** clmm `rebalance_swap_v2`: swap_v2 accounts (without remaining), then collection + members, then tick arrays. */
export function makeRebalanceSwapClmmInstruction(
  programId: PublicKey,
  swapV2Keys: AccountMeta[],
  remainingAccounts: AccountMeta[],
  collection: PublicKey,
  inputMint: PublicKey,
  outputMint: PublicKey,
  amount: BN,
  otherAmountThreshold: BN,
  sqrtPriceLimitX64: BN,
  isBaseInput: boolean,
): TransactionInstruction {
  const layout = struct([u64("amount"), u64("otherAmountThreshold"), u128("sqrtPriceLimitX64"), bool("isBaseInput")]);
  const data = Buffer.alloc(layout.span);
  layout.encode({ amount, otherAmountThreshold, sqrtPriceLimitX64, isBaseInput }, data);
  return new TransactionInstruction({
    programId,
    keys: [
      ...swapV2Keys,
      r(collection),
      r(getPdaCollectionMember(programId, collection, inputMint).publicKey),
      r(getPdaCollectionMember(programId, collection, outputMint).publicKey),
      ...remainingAccounts,
    ],
    data: Buffer.concat([collectionsAnchorData.rebalanceSwapV2, data]),
  });
}
export { MEMO_PROGRAM_ID };
