import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface ChangeVotesArgs {
  amount: BN
}

export interface ChangeVotesAccounts {
  owner: PublicKey
  /** Global config for Gauge instance */
  gaugeConfig: PublicKey
  /** Gauge for the pool */
  poolGauge: PublicKey
  /** Personal vote account for owner */
  personalGauge: PublicKey
  /** Personal reactor account for owner */
  reactor: PublicKey
  reactorProg: PublicKey
  sysvarInstruction: PublicKey
}

export const layout = borsh.struct([borsh.i64("amount")])

/** Pledge/Unpledge votes to a gauge */
export function changeVotes(
  args: ChangeVotesArgs,
  accounts: ChangeVotesAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.owner, isSigner: true, isWritable: true },
    { pubkey: accounts.gaugeConfig, isSigner: false, isWritable: true },
    { pubkey: accounts.poolGauge, isSigner: false, isWritable: true },
    { pubkey: accounts.personalGauge, isSigner: false, isWritable: true },
    { pubkey: accounts.reactor, isSigner: false, isWritable: true },
    { pubkey: accounts.reactorProg, isSigner: false, isWritable: false },
    { pubkey: accounts.sysvarInstruction, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([48, 225, 233, 230, 123, 173, 227, 158])
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
