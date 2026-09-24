import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface CpWithdrawRayAccounts {
  owner: PublicKey
  gaugeConfig: PublicKey
  personalRewarder: PublicKey
  rayHopper: PublicKey
  rayDst: PublicKey
  tokenProgram: PublicKey
}

/** CP:Withdraw earned RAY from the hopper and zero-out staged ray in the rewarder */
export function cpWithdrawRay(
  accounts: CpWithdrawRayAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.owner, isSigner: true, isWritable: true },
    { pubkey: accounts.gaugeConfig, isSigner: false, isWritable: false },
    { pubkey: accounts.personalRewarder, isSigner: false, isWritable: true },
    { pubkey: accounts.rayHopper, isSigner: false, isWritable: true },
    { pubkey: accounts.rayDst, isSigner: false, isWritable: true },
    { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([255, 180, 26, 176, 145, 98, 40, 194])
  const data = identifier
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
