import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface ClInitPersonalRewarderAccounts {
  /** Permissionless payer for the personal rewarder init */
  payer: PublicKey
  /**
   * Global tenant for the gauge program
   * Must be mutable in order to update itself before initializing the personal rewarder
   */
  gaugeConfig: PublicKey
  /**
   * Global pool gauge for the pool
   * Must be mutable in order to update itself before initializing the personal rewarder
   */
  poolGauge: PublicKey
  /**
   * Unique personal liquidity position for the CLMM pool
   * Must be mutable in order to update itself before initializing the personal rewarder
   */
  personalLiqPosition: PublicKey
  poolState: PublicKey
  personalRewarder: PublicKey
  /** The protocol position for the CLMM program */
  protocolPosition: PublicKey
  tickArrayLowerLoader: PublicKey
  tickArrayUpperLoader: PublicKey
  clmmProgram: PublicKey
  systemProgram: PublicKey
}

/** Init the personal rewarder for the concentrated flavor */
export function clInitPersonalRewarder(
  accounts: ClInitPersonalRewarderAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.payer, isSigner: true, isWritable: true },
    { pubkey: accounts.gaugeConfig, isSigner: false, isWritable: true },
    { pubkey: accounts.poolGauge, isSigner: false, isWritable: true },
    { pubkey: accounts.personalLiqPosition, isSigner: false, isWritable: true },
    { pubkey: accounts.poolState, isSigner: false, isWritable: true },
    { pubkey: accounts.personalRewarder, isSigner: false, isWritable: true },
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
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([79, 220, 160, 148, 111, 88, 243, 90])
  const data = identifier
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
