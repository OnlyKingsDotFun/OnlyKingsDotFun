import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface InitTenantArgs {
  rayMint: PublicKey
  rayVault: PublicKey
}

export interface InitTenantAccounts {
  payer: PublicKey
  tenantConfig: PublicKey
  systemProgram: PublicKey
}

export const layout = borsh.struct([
  borsh.publicKey("rayMint"),
  borsh.publicKey("rayVault"),
])

export function initTenant(
  args: InitTenantArgs,
  accounts: InitTenantAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.payer, isSigner: true, isWritable: true },
    { pubkey: accounts.tenantConfig, isSigner: true, isWritable: true },
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([63, 214, 221, 223, 87, 214, 235, 60])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      rayMint: args.rayMint,
      rayVault: args.rayVault,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
