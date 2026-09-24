import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface SyncPoolIndexAccounts {
  gaugeConfig: PublicKey
  poolGauge: PublicKey
}

/** Update the pool's index to the global index */
export function syncPoolIndex(
  accounts: SyncPoolIndexAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.gaugeConfig, isSigner: false, isWritable: true },
    { pubkey: accounts.poolGauge, isSigner: false, isWritable: true },
  ]
  const identifier = Buffer.from([254, 161, 93, 153, 213, 127, 4, 203])
  const data = identifier
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
