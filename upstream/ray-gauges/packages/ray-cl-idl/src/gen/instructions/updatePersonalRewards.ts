import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface UpdatePersonalRewardsAccounts {
  poolState: PublicKey
  protocolPosition: PublicKey
  tickArrayLowerLoader: PublicKey
  tickArrayUpperLoader: PublicKey
  /** Increase liquidity for this position */
  personalPosition: PublicKey
}

/**
 * Update personal rewards
 *
 * # Arguments
 *
 * * `ctx` - The context of accounts
 *
 */
export function updatePersonalRewards(
  accounts: UpdatePersonalRewardsAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
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
    { pubkey: accounts.personalPosition, isSigner: false, isWritable: true },
  ]
  const identifier = Buffer.from([205, 253, 6, 235, 145, 211, 74, 176])
  const data = identifier
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
