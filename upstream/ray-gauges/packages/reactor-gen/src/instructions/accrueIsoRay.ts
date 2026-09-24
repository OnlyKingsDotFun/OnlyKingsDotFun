import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface AccrueIsoRayAccounts {
  owner: PublicKey
  reactor: PublicKey
  reactorConfig: PublicKey
  govParams: PublicKey
  clockWrap: PublicKey
}

export function accrueIsoRay(
  accounts: AccrueIsoRayAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.owner, isSigner: true, isWritable: true },
    { pubkey: accounts.reactor, isSigner: false, isWritable: true },
    { pubkey: accounts.reactorConfig, isSigner: false, isWritable: true },
    { pubkey: accounts.govParams, isSigner: false, isWritable: false },
    { pubkey: accounts.clockWrap, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([162, 195, 251, 136, 163, 153, 174, 182])
  const data = identifier
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
