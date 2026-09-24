import { PublicKey } from "@solana/web3.js";
import { findProgramAddress } from "../../common/txTool/txUtils";

type ProgramAddress = { publicKey: PublicKey; nonce: number };
import { u16ToBytes } from "../clmm/libraries/utils";

const RULESET_SEED = Buffer.from("ruleset", "utf8");
const TOKEN_COLLECTION_SEED = Buffer.from("token_collection", "utf8");
const COLLECTION_MEMBER_SEED = Buffer.from("collection_member", "utf8");
const POOL_MEMBERS_SEED = Buffer.from("pool_members", "utf8");
const MEMBER_VAULT_SEED = Buffer.from("member_vault", "utf8");

export const PUMP_FUN_PROGRAM = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
export const SPL_STAKE_POOL_PROGRAM = new PublicKey("SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy");

/** Collections live inside each AMM program (cp-swap or clmm); pass the AMM's program id. */
export function getPdaRuleset(programId: PublicKey, index: number): ProgramAddress {
  return findProgramAddress([RULESET_SEED, u16ToBytes(index)], programId);
}
export function getPdaTokenCollection(programId: PublicKey, authority: PublicKey, index: number): ProgramAddress {
  return findProgramAddress([TOKEN_COLLECTION_SEED, authority.toBuffer(), u16ToBytes(index)], programId);
}
export function getPdaCollectionMember(programId: PublicKey, collection: PublicKey, mint: PublicKey): ProgramAddress {
  return findProgramAddress([COLLECTION_MEMBER_SEED, collection.toBuffer(), mint.toBuffer()], programId);
}
export function getPdaPoolMembers(programId: PublicKey, poolId: PublicKey): ProgramAddress {
  return findProgramAddress([POOL_MEMBERS_SEED, poolId.toBuffer()], programId);
}
export function getPdaMemberVault(programId: PublicKey, poolId: PublicKey, mint: PublicKey): ProgramAddress {
  return findProgramAddress([MEMBER_VAULT_SEED, poolId.toBuffer(), mint.toBuffer()], programId);
}
/** pump.fun bonding curve for a mint (proof account for the PumpFunLaunch rule). */
export function getPumpBondingCurve(mint: PublicKey, pumpProgram: PublicKey = PUMP_FUN_PROGRAM): ProgramAddress {
  return findProgramAddress([Buffer.from("bonding-curve", "utf8"), mint.toBuffer()], pumpProgram);
}
