import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface ClosePositionAccounts {
  /** The position nft owner */
  nftOwner: PublicKey
  /** Mint address bound to the personal position. */
  positionNftMint: PublicKey
  /** User token account where position NFT be minted to */
  positionNftAccount: PublicKey
  personalPosition: PublicKey
  /** System program to close the position state account */
  systemProgram: PublicKey
  /** Token/Token2022 program to close token/mint account */
  tokenProgram: PublicKey
}

/**
 * Close the user's position and NFT account. If the NFT mint belongs to token2022, it will also be closed and the funds returned to the NFT owner.
 *
 * # Arguments
 *
 * * `ctx` - The context of accounts
 *
 */
export function closePosition(
  accounts: ClosePositionAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.nftOwner, isSigner: true, isWritable: true },
    { pubkey: accounts.positionNftMint, isSigner: false, isWritable: true },
    { pubkey: accounts.positionNftAccount, isSigner: false, isWritable: true },
    { pubkey: accounts.personalPosition, isSigner: false, isWritable: true },
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
    { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([123, 134, 81, 0, 49, 68, 98, 98])
  const data = identifier
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
