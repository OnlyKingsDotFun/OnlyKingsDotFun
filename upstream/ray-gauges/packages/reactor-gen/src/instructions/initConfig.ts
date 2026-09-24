import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface InitConfigArgs {
  rayRewardDailyEmission: BN
  isoRayAprBps: number
}

export interface InitConfigAccounts {
  payer: PublicKey
  config: PublicKey
  /** Vault to hold RAY tokens that are staked by Reactor depositors */
  rayVault: PublicKey
  /** Hopper to hold RAY rewards that get paid out to Reactor stakers */
  rayHopper: PublicKey
  rayMint: PublicKey
  tokenProgram: PublicKey
  systemProgram: PublicKey
}

export const layout = borsh.struct([
  borsh.u64("rayRewardDailyEmission"),
  borsh.u16("isoRayAprBps"),
])

/** Initialize the reactor config */
export function initConfig(
  args: InitConfigArgs,
  accounts: InitConfigAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.payer, isSigner: true, isWritable: true },
    { pubkey: accounts.config, isSigner: false, isWritable: true },
    { pubkey: accounts.rayVault, isSigner: false, isWritable: true },
    { pubkey: accounts.rayHopper, isSigner: false, isWritable: true },
    { pubkey: accounts.rayMint, isSigner: false, isWritable: false },
    { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([23, 235, 115, 232, 168, 96, 1, 231])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      rayRewardDailyEmission: args.rayRewardDailyEmission,
      isoRayAprBps: args.isoRayAprBps,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
