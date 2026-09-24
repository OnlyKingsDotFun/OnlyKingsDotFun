import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface InitReactorAccounts {
  payer: PublicKey
  owner: PublicKey
  reactor: PublicKey
  systemProgram: PublicKey
}

/** Initialize a personal reactor account */
export function initReactor(
  accounts: InitReactorAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.payer, isSigner: true, isWritable: true },
    { pubkey: accounts.owner, isSigner: false, isWritable: false },
    { pubkey: accounts.reactor, isSigner: false, isWritable: true },
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([105, 205, 59, 160, 102, 194, 185, 91])
  const data = identifier
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
