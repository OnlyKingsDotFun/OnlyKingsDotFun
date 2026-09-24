import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface CollectRayRewardsAccounts {
  owner: PublicKey
  reactor: PublicKey
  reactorConfig: PublicKey
  rayRewardHopper: PublicKey
  rayDst: PublicKey
  tokenProgram: PublicKey
}

/** Collect the earned RAY rewards */
export function collectRayRewards(
  accounts: CollectRayRewardsAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.owner, isSigner: true, isWritable: true },
    { pubkey: accounts.reactor, isSigner: false, isWritable: true },
    { pubkey: accounts.reactorConfig, isSigner: false, isWritable: false },
    { pubkey: accounts.rayRewardHopper, isSigner: false, isWritable: true },
    { pubkey: accounts.rayDst, isSigner: false, isWritable: true },
    { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([115, 168, 104, 95, 4, 70, 174, 66])
  const data = identifier
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
