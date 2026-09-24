import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface LockVotesArgs {
  amount: BN
}

export interface LockVotesAccounts {
  owner: PublicKey
  reactor: PublicKey
  sysvarInstruction: PublicKey
}

export const layout = borsh.struct([borsh.u64("amount")])

/** Lock Reactor votes */
export function lockVotes(
  args: LockVotesArgs,
  accounts: LockVotesAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.owner, isSigner: true, isWritable: true },
    { pubkey: accounts.reactor, isSigner: false, isWritable: true },
    { pubkey: accounts.sysvarInstruction, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([156, 21, 164, 149, 168, 115, 118, 227])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      amount: args.amount,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
