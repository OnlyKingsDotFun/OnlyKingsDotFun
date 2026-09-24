import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface SyncReactorAccounts {
  reactor: PublicKey
  reactorConfig: PublicKey
}

/** Update the reactor's global indexes */
export function syncReactor(
  accounts: SyncReactorAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.reactor, isSigner: false, isWritable: true },
    { pubkey: accounts.reactorConfig, isSigner: false, isWritable: true },
  ]
  const identifier = Buffer.from([221, 39, 249, 170, 240, 180, 135, 95])
  const data = identifier
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
