import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface UpdatePersonalPositionAccounts {
  timeTracker: PublicKey
  personalPosition: PublicKey
}

/** Sync the personal position with the time tracker */
export function updatePersonalPosition(
  accounts: UpdatePersonalPositionAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.timeTracker, isSigner: false, isWritable: true },
    { pubkey: accounts.personalPosition, isSigner: false, isWritable: true },
  ]
  const identifier = Buffer.from([238, 1, 246, 21, 48, 185, 65, 99])
  const data = identifier
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
