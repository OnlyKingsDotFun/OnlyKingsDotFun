import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface InitPoolGaugeAccounts {
  payer: PublicKey
  gaugeConfig: PublicKey
  poolGauge: PublicKey
  /** There will not be a CP escrow nor CL position for them anyway */
  poolId: PublicKey
  systemProgram: PublicKey
}

export function initPoolGauge(
  accounts: InitPoolGaugeAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.payer, isSigner: true, isWritable: true },
    { pubkey: accounts.gaugeConfig, isSigner: false, isWritable: true },
    { pubkey: accounts.poolGauge, isSigner: false, isWritable: true },
    { pubkey: accounts.poolId, isSigner: false, isWritable: false },
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([168, 111, 24, 160, 185, 244, 140, 120])
  const data = identifier
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
