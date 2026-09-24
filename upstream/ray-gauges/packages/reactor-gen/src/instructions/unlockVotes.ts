import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface UnlockVotesArgs {
  amount: BN
}

export interface UnlockVotesAccounts {
  owner: PublicKey
  reactor: PublicKey
  sysvarInstruction: PublicKey
}

export const layout = borsh.struct([borsh.u64("amount")])

/** Unlock Reactor votes */
export function unlockVotes(
  args: UnlockVotesArgs,
  accounts: UnlockVotesAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.owner, isSigner: true, isWritable: true },
    { pubkey: accounts.reactor, isSigner: false, isWritable: true },
    { pubkey: accounts.sysvarInstruction, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([31, 4, 235, 111, 176, 15, 112, 106])
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
