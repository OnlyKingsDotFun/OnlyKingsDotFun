import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface WithdrawRayAccounts {
  owner: PublicKey
  gaugeConfig: PublicKey
  personalRewarder: PublicKey
  rayHopper: PublicKey
  rayDst: PublicKey
  tokenProgram: PublicKey
}

/** Withdraw earned RAY from the hopper and zero-out staged ray in the rewarder */
export function withdrawRay(
  accounts: WithdrawRayAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.owner, isSigner: true, isWritable: true },
    { pubkey: accounts.gaugeConfig, isSigner: false, isWritable: true },
    { pubkey: accounts.personalRewarder, isSigner: false, isWritable: true },
    { pubkey: accounts.rayHopper, isSigner: false, isWritable: true },
    { pubkey: accounts.rayDst, isSigner: false, isWritable: true },
    { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([219, 244, 113, 166, 69, 222, 213, 10])
  const data = identifier
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
