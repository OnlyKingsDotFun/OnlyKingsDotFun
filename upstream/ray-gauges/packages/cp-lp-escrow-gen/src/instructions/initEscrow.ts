import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface InitEscrowAccounts {
  payer: PublicKey
  poolState: PublicKey
  lpMint: PublicKey
  timeTracker: PublicKey
  escrow: PublicKey
  systemProgram: PublicKey
  tokenProgram: PublicKey
}

/** Init an escrow account for a pool */
export function initEscrow(
  accounts: InitEscrowAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.payer, isSigner: true, isWritable: true },
    { pubkey: accounts.poolState, isSigner: false, isWritable: false },
    { pubkey: accounts.lpMint, isSigner: false, isWritable: false },
    { pubkey: accounts.timeTracker, isSigner: false, isWritable: true },
    { pubkey: accounts.escrow, isSigner: false, isWritable: true },
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
    { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([70, 46, 40, 23, 6, 11, 81, 139])
  const data = identifier
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
