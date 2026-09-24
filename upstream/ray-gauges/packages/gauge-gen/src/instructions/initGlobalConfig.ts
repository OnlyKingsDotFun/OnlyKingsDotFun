import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface InitGlobalConfigArgs {
  rayEmissionPerDay: BN
}

export interface InitGlobalConfigAccounts {
  /** must be admin */
  payer: PublicKey
  gaugeConfig: PublicKey
  rayHopper: PublicKey
  rayMint: PublicKey
  tokenProgram: PublicKey
  systemProgram: PublicKey
}

export const layout = borsh.struct([borsh.u64("rayEmissionPerDay")])

export function initGlobalConfig(
  args: InitGlobalConfigArgs,
  accounts: InitGlobalConfigAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.payer, isSigner: true, isWritable: true },
    { pubkey: accounts.gaugeConfig, isSigner: false, isWritable: true },
    { pubkey: accounts.rayHopper, isSigner: false, isWritable: true },
    { pubkey: accounts.rayMint, isSigner: false, isWritable: false },
    { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([140, 136, 214, 48, 87, 0, 120, 255])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      rayEmissionPerDay: args.rayEmissionPerDay,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
