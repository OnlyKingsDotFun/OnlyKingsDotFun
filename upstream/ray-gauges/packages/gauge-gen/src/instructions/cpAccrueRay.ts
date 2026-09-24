import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface CpAccrueRayAccounts {
  payer: PublicKey
  gaugeConfig: PublicKey
  personalRewarder: PublicKey
  poolGauge: PublicKey
  liqPosition: PublicKey
  timeTracker: PublicKey
  cpLpEscrowProgram: PublicKey
}

/** CP: Accrue RAY to the PersonalRewarder with a CP flavor */
export function cpAccrueRay(
  accounts: CpAccrueRayAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.payer, isSigner: true, isWritable: true },
    { pubkey: accounts.gaugeConfig, isSigner: false, isWritable: true },
    { pubkey: accounts.personalRewarder, isSigner: false, isWritable: true },
    { pubkey: accounts.poolGauge, isSigner: false, isWritable: true },
    { pubkey: accounts.liqPosition, isSigner: false, isWritable: true },
    { pubkey: accounts.timeTracker, isSigner: false, isWritable: true },
    { pubkey: accounts.cpLpEscrowProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([106, 65, 40, 153, 25, 244, 249, 212])
  const data = identifier
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
