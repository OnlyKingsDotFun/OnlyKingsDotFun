import BN from "bn.js";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import ModuleBase, { ModuleBaseProps } from "../moduleBase";
import { TxVersion } from "@/common/txTool/txType";
import { MakeTxData } from "@/common/txTool/txTool";
import { getATAAddress, getIsotopeProgramIds } from "@/common";
import { getMultipleAccountsInfoWithCustomFlags } from "@/common/accountInfo";
import { CpmmPoolInfoLayout, CpmmConfigInfoLayout } from "../cpmm/layout";
import { getPdaPoolAuthority } from "../cpmm/pda";
import { PoolInfoLayout as ClmmPoolInfoLayout } from "../clmm/layout";
import {
  RulesetLayout, TokenCollectionLayout, CollectionMemberLayout, PoolMembersLayout, RuleKind, RATE_ONE,
} from "./layout";
import {
  getPdaCollectionMember, getPdaPoolMembers, getPdaRuleset, getPdaTokenCollection, getPumpBondingCurve, getPdaMemberVault,
} from "./pda";
import {
  makeCreateTokenCollectionInstruction, makeRegisterCollectionMemberInstruction, makeInitPoolMembersInstruction,
  makeAddPoolMemberInstruction, makeIntraSwapInstruction, makeSyncMemberRateInstruction, makeSetCollectionMemberRateInstruction,
  IntraSwapMember,
} from "./instruction";
import { quoteIntraSwap, IntraSwapQuote } from "./curve";

export type Amm = "cpmm" | "clmm";

export interface RulesetInfo { id: PublicKey; index: number; kind: RuleKind; flags: number; programId: PublicKey }
export interface TokenCollectionInfo {
  id: PublicKey; index: number; authority: PublicKey; ruleset: PublicKey; quoteMint: PublicKey; rebalanceFeeDivisor: number; memberCount: number;
}
export interface CollectionMemberInfo { id: PublicKey; collection: PublicKey; mint: PublicKey; rate: BN; registeredBy: PublicKey }
export interface PoolMembersInfo {
  id: PublicKey; pool: PublicKey; collection: PublicKey; baseIsToken0: boolean; amp: BN;
  members: { mint: PublicKey; vault: PublicKey; decimals: number; protocolFeesOwed: BN; fundFeesOwed: BN }[];
}

/**
 * Token collections and collection pools. Collections live inside each AMM program, so every method
 * takes `amm` and resolves the program id from `scope.programId`.
 */
export class Collections extends ModuleBase {
  constructor(params: ModuleBaseProps) {
    super(params);
  }
  public programId(amm: Amm): PublicKey {
    const ids = getIsotopeProgramIds();
    return amm === "cpmm" ? ids.CPMM_PROGRAM : ids.CLMM_PROGRAM;
  }

  // ---------------------------------------------------------------- reads
  public async getRuleset(amm: Amm, index: number): Promise<RulesetInfo | undefined> {
    const id = getPdaRuleset(this.programId(amm), index).publicKey;
    const acc = await this.scope.connection.getAccountInfo(id);
    if (!acc) return undefined;
    const d = RulesetLayout.decode(acc.data);
    return { id, index: d.index, kind: d.kind as RuleKind, flags: d.flags, programId: d.programId };
  }
  public async getCollection(amm: Amm, id: PublicKey): Promise<TokenCollectionInfo | undefined> {
    const acc = await this.scope.connection.getAccountInfo(id);
    if (!acc) return undefined;
    const d = TokenCollectionLayout.decode(acc.data);
    return { id, index: d.index, authority: d.authority, ruleset: d.ruleset, quoteMint: d.quoteMint, rebalanceFeeDivisor: d.rebalanceFeeDivisor, memberCount: d.memberCount };
  }
  /** All collections of an AMM program (getProgramAccounts on the TokenCollection discriminator). */
  public async getAllCollections(amm: Amm): Promise<TokenCollectionInfo[]> {
    const accs = await this.scope.connection.getProgramAccounts(this.programId(amm), {
      filters: [{ dataSize: TokenCollectionLayout.span }],
    });
    return accs.map(({ pubkey, account }) => {
      const d = TokenCollectionLayout.decode(account.data);
      return { id: pubkey, index: d.index, authority: d.authority, ruleset: d.ruleset, quoteMint: d.quoteMint, rebalanceFeeDivisor: d.rebalanceFeeDivisor, memberCount: d.memberCount };
    });
  }
  public async getMembers(amm: Amm, collection: PublicKey): Promise<CollectionMemberInfo[]> {
    const accs = await this.scope.connection.getProgramAccounts(this.programId(amm), {
      filters: [{ dataSize: CollectionMemberLayout.span }, { memcmp: { offset: 16, bytes: collection.toBase58() } }],
    });
    return accs.map(({ pubkey, account }) => {
      const d = CollectionMemberLayout.decode(account.data);
      return { id: pubkey, collection: d.collection, mint: d.mint, rate: d.rate, registeredBy: d.registeredBy };
    });
  }
  public async getPoolMembers(amm: Amm, poolId: PublicKey): Promise<PoolMembersInfo | undefined> {
    const id = getPdaPoolMembers(this.programId(amm), poolId).publicKey;
    const acc = await this.scope.connection.getAccountInfo(id);
    if (!acc) return undefined;
    const d = PoolMembersLayout.decode(acc.data);
    return { id, pool: d.pool, collection: d.collection, baseIsToken0: d.baseIsToken0, amp: d.amp, members: d.members.slice(0, d.n) };
  }

  /** Reserves (vault amount minus fees owed) and rates for every member, for quoting. */
  public async getIntraSwapState(amm: Amm, poolId: PublicKey): Promise<{
    poolMembers: PoolMembersInfo; collection: TokenCollectionInfo; reserves: BN[]; rates: BN[]; tradeFeeRate: BN; ammConfigId: PublicKey; members: IntraSwapMember[];
  }> {
    const programId = this.programId(amm);
    const pm = await this.getPoolMembers(amm, poolId);
    if (!pm) throw new Error("pool is not a collection pool");
    const collection = await this.getCollection(amm, pm.collection);
    if (!collection) throw new Error("collection not found");
    const memberIds = pm.members.map((m) => getPdaCollectionMember(programId, pm.collection, m.mint).publicKey);
    const keys = [poolId, ...pm.members.map((m) => m.vault), ...memberIds];
    const infos = await getMultipleAccountsInfoWithCustomFlags(this.scope.connection, keys.map((k) => ({ pubkey: k })));
    const poolAcc = infos[0].accountInfo!;
    let ammConfigId: PublicKey;
    let baseProtocol: BN, baseFund: BN, tradeFeeRate: BN;
    if (amm === "cpmm") {
      const p = CpmmPoolInfoLayout.decode(poolAcc.data);
      ammConfigId = p.configId;
      baseProtocol = pm.baseIsToken0 ? p.protocolFeesMintA : p.protocolFeesMintB;
      baseFund = pm.baseIsToken0 ? p.fundFeesMintA : p.fundFeesMintB;
      const cfg = await this.scope.connection.getAccountInfo(ammConfigId);
      tradeFeeRate = CpmmConfigInfoLayout.decode(cfg!.data).tradeFeeRate;
    } else {
      const p = ClmmPoolInfoLayout.decode(poolAcc.data);
      ammConfigId = p.configId;
      baseProtocol = pm.baseIsToken0 ? p.protocolFeesTokenA : p.protocolFeesTokenB;
      baseFund = pm.baseIsToken0 ? p.fundFeesTokenA : p.fundFeesTokenB;
      const cfg = await this.scope.connection.getAccountInfo(ammConfigId);
      tradeFeeRate = new BN(cfg!.data.readUInt32LE(47));
    }
    const n = pm.members.length;
    const reserves: BN[] = [];
    const rates: BN[] = [];
    const members: IntraSwapMember[] = [];
    for (let k = 0; k < n; k++) {
      const vault = infos[1 + k].accountInfo!;
      const amount = new BN(vault.data.subarray(64, 72), "le");
      const owed = k === 0 ? baseProtocol.add(baseFund) : pm.members[k].protocolFeesOwed.add(pm.members[k].fundFeesOwed);
      reserves.push(amount.sub(owed));
      rates.push(CollectionMemberLayout.decode(infos[1 + n + k].accountInfo!.data).rate);
      members.push({ mint: pm.members[k].mint, vault: pm.members[k].vault, mintProgram: vault.owner });
    }
    return { poolMembers: pm, collection, reserves, rates, tradeFeeRate, ammConfigId, members };
  }

  public quote(state: Awaited<ReturnType<Collections["getIntraSwapState"]>>, fromIndex: number, toIndex: number, amountIn: BN): IntraSwapQuote {
    return quoteIntraSwap(state.reserves, state.rates, state.poolMembers.amp, fromIndex, toIndex, amountIn, state.tradeFeeRate, state.collection.rebalanceFeeDivisor);
  }

  // ---------------------------------------------------------------- writes
  public async createCollection<T extends TxVersion>({ amm, rulesetIndex, quoteMint, index, rebalanceFeeDivisor, txVersion }: {
    amm: Amm; rulesetIndex: number; quoteMint: PublicKey; index: number; rebalanceFeeDivisor: number; txVersion?: T;
  }): Promise<MakeTxData<T, { collection: PublicKey }>> {
    const programId = this.programId(amm);
    const ruleset = getPdaRuleset(programId, rulesetIndex).publicKey;
    const txBuilder = this.createTxBuilder();
    txBuilder.addInstruction({ instructions: [makeCreateTokenCollectionInstruction(programId, this.scope.ownerPubKey, ruleset, quoteMint, index, rebalanceFeeDivisor)] });
    return txBuilder.versionBuild({ txVersion, extInfo: { collection: getPdaTokenCollection(programId, this.scope.ownerPubKey, index).publicKey } }) as Promise<MakeTxData<T, { collection: PublicKey }>>;
  }

  /** Registers a mint; picks the proof account from the ruleset kind (pump curve, stake pool) unless given. */
  public async registerMember<T extends TxVersion>({ amm, collection, mint, proof, stakePool, txVersion }: {
    amm: Amm; collection: PublicKey; mint: PublicKey; proof?: PublicKey[]; stakePool?: PublicKey; txVersion?: T;
  }): Promise<MakeTxData<T, { member: PublicKey }>> {
    const programId = this.programId(amm);
    const c = await this.getCollection(amm, collection);
    if (!c) throw new Error("collection not found");
    const rsAcc = await this.scope.connection.getAccountInfo(c.ruleset);
    const rs = RulesetLayout.decode(rsAcc!.data);
    let proofAccounts = proof ?? [];
    if (!proof && !mint.equals(c.quoteMint)) {
      if (rs.kind === RuleKind.PumpFunLaunch) proofAccounts = [getPumpBondingCurve(mint, rs.programId).publicKey];
      if (rs.kind === RuleKind.Lst) {
        if (!stakePool) throw new Error("Lst ruleset needs the mint's stake pool as proof");
        proofAccounts = [stakePool];
      }
    }
    const txBuilder = this.createTxBuilder();
    txBuilder.addInstruction({ instructions: [makeRegisterCollectionMemberInstruction(programId, this.scope.ownerPubKey, collection, c.ruleset, mint, proofAccounts)] });
    return txBuilder.versionBuild({ txVersion, extInfo: { member: getPdaCollectionMember(programId, collection, mint).publicKey } }) as Promise<MakeTxData<T, { member: PublicKey }>>;
  }

  public async syncMemberRate<T extends TxVersion>({ amm, collection, mint, stakePool, txVersion }: { amm: Amm; collection: PublicKey; mint: PublicKey; stakePool: PublicKey; txVersion?: T }): Promise<MakeTxData<T>> {
    const programId = this.programId(amm);
    const c = await this.getCollection(amm, collection);
    if (!c) throw new Error("collection not found");
    const txBuilder = this.createTxBuilder();
    txBuilder.addInstruction({ instructions: [makeSyncMemberRateInstruction(programId, collection, c.ruleset, getPdaCollectionMember(programId, collection, mint).publicKey, stakePool)] });
    return txBuilder.versionBuild({ txVersion }) as Promise<MakeTxData<T>>;
  }

  public async setMemberRate<T extends TxVersion>({ amm, collection, mint, rate, txVersion }: { amm: Amm; collection: PublicKey; mint: PublicKey; rate: BN; txVersion?: T }): Promise<MakeTxData<T>> {
    const programId = this.programId(amm);
    const txBuilder = this.createTxBuilder();
    txBuilder.addInstruction({ instructions: [makeSetCollectionMemberRateInstruction(programId, this.scope.ownerPubKey, collection, getPdaCollectionMember(programId, collection, mint).publicKey, rate)] });
    return txBuilder.versionBuild({ txVersion }) as Promise<MakeTxData<T>>;
  }

  /** Bind a pair to a collection and add members in one transaction. */
  public async bindPool<T extends TxVersion>({ amm, poolId, collection, baseMint, amp = 200, members = [], txVersion }: {
    amm: Amm; poolId: PublicKey; collection: PublicKey; baseMint: PublicKey; amp?: number; members?: { mint: PublicKey; mintProgram?: PublicKey }[]; txVersion?: T;
  }): Promise<MakeTxData<T, { poolMembers: PublicKey; vaults: PublicKey[] }>> {
    const programId = this.programId(amm);
    const opts = amm === "cpmm" ? ({ amm, authority: getPdaPoolAuthority(programId).publicKey } as const) : ({ amm } as const);
    const txBuilder = this.createTxBuilder();
    const ixs = [makeInitPoolMembersInstruction(programId, this.scope.ownerPubKey, poolId, collection, baseMint, amp)];
    for (const m of members) ixs.push(makeAddPoolMemberInstruction(programId, this.scope.ownerPubKey, poolId, collection, m.mint, m.mintProgram ?? TOKEN_PROGRAM_ID, opts));
    txBuilder.addInstruction({ instructions: ixs });
    return txBuilder.versionBuild({
      txVersion,
      extInfo: { poolMembers: getPdaPoolMembers(programId, poolId).publicKey, vaults: members.map((m) => getPdaMemberVault(programId, poolId, m.mint).publicKey) },
    }) as Promise<MakeTxData<T, { poolMembers: PublicKey; vaults: PublicKey[] }>>;
  }

  public async addPoolMember<T extends TxVersion>({ amm, poolId, collection, mint, mintProgram = TOKEN_PROGRAM_ID, txVersion }: { amm: Amm; poolId: PublicKey; collection: PublicKey; mint: PublicKey; mintProgram?: PublicKey; txVersion?: T }): Promise<MakeTxData<T>> {
    const programId = this.programId(amm);
    const opts = amm === "cpmm" ? ({ amm, authority: getPdaPoolAuthority(programId).publicKey } as const) : ({ amm } as const);
    const txBuilder = this.createTxBuilder();
    txBuilder.addInstruction({ instructions: [makeAddPoolMemberInstruction(programId, this.scope.ownerPubKey, poolId, collection, mint, mintProgram, opts)] });
    return txBuilder.versionBuild({ txVersion }) as Promise<MakeTxData<T>>;
  }

  /** Intra swap with an on-client quote and slippage (bps). Creates the output ATA if missing. */
  public async intraSwap<T extends TxVersion>({ amm, poolId, fromMint, toMint, amountIn, slippageBps = 50, txVersion }: {
    amm: Amm; poolId: PublicKey; fromMint: PublicKey; toMint: PublicKey; amountIn: BN; slippageBps?: number; txVersion?: T;
  }): Promise<MakeTxData<T, { quote: IntraSwapQuote }>> {
    const programId = this.programId(amm);
    const state = await this.getIntraSwapState(amm, poolId);
    const from = state.members.findIndex((m) => m.mint.equals(fromMint));
    const to = state.members.findIndex((m) => m.mint.equals(toMint));
    if (from < 0 || to < 0) throw new Error("mint is not a member of this pool");
    const quote = this.quote(state, from, to, amountIn);
    const minOut = quote.amountOut.muln(10_000 - slippageBps).divn(10_000);
    const owner = this.scope.ownerPubKey;
    const userIn = getATAAddress(owner, fromMint, state.members[from].mintProgram).publicKey;
    const userOut = getATAAddress(owner, toMint, state.members[to].mintProgram).publicKey;
    const txBuilder = this.createTxBuilder();
    const outInfo = await this.scope.connection.getAccountInfo(userOut);
    if (!outInfo) {
      const { createAssociatedTokenAccountIdempotentInstruction } = await import("@solana/spl-token");
      txBuilder.addInstruction({ instructions: [createAssociatedTokenAccountIdempotentInstruction(owner, userOut, owner, toMint, state.members[to].mintProgram)] });
    }
    const opts = amm === "cpmm" ? ({ amm, authority: getPdaPoolAuthority(programId).publicKey } as const) : ({ amm } as const);
    txBuilder.addInstruction({
      instructions: [makeIntraSwapInstruction(programId, owner, poolId, state.ammConfigId, state.collection.id, state.members, userIn, userOut, from, to, amountIn, minOut, opts)],
    });
    return txBuilder.versionBuild({ txVersion, extInfo: { quote } }) as Promise<MakeTxData<T, { quote: IntraSwapQuote }>>;
  }
}
export { RATE_ONE };
