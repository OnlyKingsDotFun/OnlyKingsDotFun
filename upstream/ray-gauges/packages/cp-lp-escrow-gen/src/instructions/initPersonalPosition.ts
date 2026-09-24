import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface InitPersonalPositionAccounts {
  owner: PublicKey
  timeTracker: PublicKey
  personalPosition: PublicKey
  systemProgram: PublicKey
}

/** Init a personal position for a user */
export function initPersonalPosition(
  accounts: InitPersonalPositionAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.owner, isSigner: true, isWritable: true },
    { pubkey: accounts.timeTracker, isSigner: false, isWritable: true },
    { pubkey: accounts.personalPosition, isSigner: false, isWritable: true },
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([164, 58, 37, 202, 48, 165, 126, 206])
  const data = identifier
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
