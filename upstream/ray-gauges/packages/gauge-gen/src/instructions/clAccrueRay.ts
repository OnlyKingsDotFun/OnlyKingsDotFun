import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface ClAccrueRayAccounts {
  payer: PublicKey
  gaugeConfig: PublicKey
  personalRewarder: PublicKey
  poolGauge: PublicKey
  poolPosition: PublicKey
  poolState: PublicKey
  /** The protocol position for the CLMM program */
  protocolPosition: PublicKey
  tickArrayLowerLoader: PublicKey
  tickArrayUpperLoader: PublicKey
  clmmProgram: PublicKey
}

/** Accrue RAY to the PersonalRewarder with a Concentrated flavor */
export function clAccrueRay(
  accounts: ClAccrueRayAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.payer, isSigner: true, isWritable: true },
    { pubkey: accounts.gaugeConfig, isSigner: false, isWritable: true },
    { pubkey: accounts.personalRewarder, isSigner: false, isWritable: true },
    { pubkey: accounts.poolGauge, isSigner: false, isWritable: true },
    { pubkey: accounts.poolPosition, isSigner: false, isWritable: true },
    { pubkey: accounts.poolState, isSigner: false, isWritable: true },
    { pubkey: accounts.protocolPosition, isSigner: false, isWritable: true },
    {
      pubkey: accounts.tickArrayLowerLoader,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.tickArrayUpperLoader,
      isSigner: false,
      isWritable: true,
    },
    { pubkey: accounts.clmmProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([30, 241, 56, 112, 168, 87, 114, 84])
  const data = identifier
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
