import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface InitPersonalGaugeAccounts {
  feePayer: PublicKey
  owner: PublicKey
  poolGauge: PublicKey
  personalGauge: PublicKey
  systemProgram: PublicKey
}

/** Init a vote-tracking gauge */
export function initPersonalGauge(
  accounts: InitPersonalGaugeAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.feePayer, isSigner: true, isWritable: true },
    { pubkey: accounts.owner, isSigner: false, isWritable: false },
    { pubkey: accounts.poolGauge, isSigner: false, isWritable: false },
    { pubkey: accounts.personalGauge, isSigner: false, isWritable: true },
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([166, 158, 52, 25, 107, 52, 226, 249])
  const data = identifier
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
