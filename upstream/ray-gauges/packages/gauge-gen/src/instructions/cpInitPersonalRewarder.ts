import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface CpInitPersonalRewarderAccounts {
  /** This could be permissionless */
  owner: PublicKey
  gaugeConfig: PublicKey
  poolGauge: PublicKey
  personalRewarder: PublicKey
  personalLiqPosition: PublicKey
  /** The time tracker must link to the pool gauge */
  timeTracker: PublicKey
  systemProgram: PublicKey
  cpLpEscrowProgram: PublicKey
}

/** CP: Initialize the personal RAY rewarder */
export function cpInitPersonalRewarder(
  accounts: CpInitPersonalRewarderAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.owner, isSigner: true, isWritable: true },
    { pubkey: accounts.gaugeConfig, isSigner: false, isWritable: true },
    { pubkey: accounts.poolGauge, isSigner: false, isWritable: true },
    { pubkey: accounts.personalRewarder, isSigner: false, isWritable: true },
    { pubkey: accounts.personalLiqPosition, isSigner: false, isWritable: true },
    { pubkey: accounts.timeTracker, isSigner: false, isWritable: true },
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
    { pubkey: accounts.cpLpEscrowProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([155, 84, 4, 100, 81, 73, 247, 227])
  const data = identifier
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
