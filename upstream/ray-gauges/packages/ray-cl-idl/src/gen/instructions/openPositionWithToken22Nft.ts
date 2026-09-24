import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface OpenPositionWithToken22NftArgs {
  tickLowerIndex: number
  tickUpperIndex: number
  tickArrayLowerStartIndex: number
  tickArrayUpperStartIndex: number
  liquidity: BN
  amount0Max: BN
  amount1Max: BN
  withMetadata: boolean
  baseFlag: boolean | null
}

export interface OpenPositionWithToken22NftAccounts {
  /** Pays to mint the position */
  payer: PublicKey
  positionNftOwner: PublicKey
  /** Unique token mint address, initialize in constract */
  positionNftMint: PublicKey
  positionNftAccount: PublicKey
  /** Add liquidity for this pool */
  poolState: PublicKey
  /** Store the information of market marking in range */
  protocolPosition: PublicKey
  tickArrayLower: PublicKey
  tickArrayUpper: PublicKey
  /** personal position state */
  personalPosition: PublicKey
  /** The token_0 account deposit token to the pool */
  tokenAccount0: PublicKey
  /** The token_1 account deposit token to the pool */
  tokenAccount1: PublicKey
  /** The address that holds pool tokens for token_0 */
  tokenVault0: PublicKey
  /** The address that holds pool tokens for token_1 */
  tokenVault1: PublicKey
  /** Sysvar for token mint and ATA creation */
  rent: PublicKey
  /** Program to create the position manager state account */
  systemProgram: PublicKey
  /** Program to transfer for token account */
  tokenProgram: PublicKey
  /** Program to create an ATA for receiving position NFT */
  associatedTokenProgram: PublicKey
  /** Program to create NFT mint/token account and transfer for token22 account */
  tokenProgram2022: PublicKey
  /** The mint of token vault 0 */
  vault0Mint: PublicKey
  /** The mint of token vault 1 */
  vault1Mint: PublicKey
}

export const layout = borsh.struct([
  borsh.i32("tickLowerIndex"),
  borsh.i32("tickUpperIndex"),
  borsh.i32("tickArrayLowerStartIndex"),
  borsh.i32("tickArrayUpperStartIndex"),
  borsh.u128("liquidity"),
  borsh.u64("amount0Max"),
  borsh.u64("amount1Max"),
  borsh.bool("withMetadata"),
  borsh.option(borsh.bool(), "baseFlag"),
])

/**
 * Creates a new position wrapped in a Token2022 NFT without relying on metadata_program and metadata_account, reduce the cost for user to create a personal position.
 *
 * # Arguments
 *
 * * `ctx` - The context of accounts
 * * `tick_lower_index` - The low boundary of market
 * * `tick_upper_index` - The upper boundary of market
 * * `tick_array_lower_start_index` - The start index of tick array which include tick low
 * * `tick_array_upper_start_index` - The start index of tick array which include tick upper
 * * `liquidity` - The liquidity to be added, if zero, and the base_flage is specified, calculate liquidity base amount_0_max or amount_1_max according base_flag, otherwise open position with zero liquidity
 * * `amount_0_max` - The max amount of token_0 to spend, which serves as a slippage check
 * * `amount_1_max` - The max amount of token_1 to spend, which serves as a slippage check
 * * `with_metadata` - The flag indicating whether to create NFT mint metadata
 * * `base_flag` - if the liquidity specified as zero, true: calculate liquidity base amount_0_max otherwise base amount_1_max
 *
 */
export function openPositionWithToken22Nft(
  args: OpenPositionWithToken22NftArgs,
  accounts: OpenPositionWithToken22NftAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.payer, isSigner: true, isWritable: true },
    { pubkey: accounts.positionNftOwner, isSigner: false, isWritable: false },
    { pubkey: accounts.positionNftMint, isSigner: true, isWritable: true },
    { pubkey: accounts.positionNftAccount, isSigner: false, isWritable: true },
    { pubkey: accounts.poolState, isSigner: false, isWritable: true },
    { pubkey: accounts.protocolPosition, isSigner: false, isWritable: true },
    { pubkey: accounts.tickArrayLower, isSigner: false, isWritable: true },
    { pubkey: accounts.tickArrayUpper, isSigner: false, isWritable: true },
    { pubkey: accounts.personalPosition, isSigner: false, isWritable: true },
    { pubkey: accounts.tokenAccount0, isSigner: false, isWritable: true },
    { pubkey: accounts.tokenAccount1, isSigner: false, isWritable: true },
    { pubkey: accounts.tokenVault0, isSigner: false, isWritable: true },
    { pubkey: accounts.tokenVault1, isSigner: false, isWritable: true },
    { pubkey: accounts.rent, isSigner: false, isWritable: false },
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
    { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
    {
      pubkey: accounts.associatedTokenProgram,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: accounts.tokenProgram2022, isSigner: false, isWritable: false },
    { pubkey: accounts.vault0Mint, isSigner: false, isWritable: false },
    { pubkey: accounts.vault1Mint, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([77, 255, 174, 82, 125, 29, 201, 46])
  const buffer = Buffer.alloc(1000)
  const len = layout.encode(
    {
      tickLowerIndex: args.tickLowerIndex,
      tickUpperIndex: args.tickUpperIndex,
      tickArrayLowerStartIndex: args.tickArrayLowerStartIndex,
      tickArrayUpperStartIndex: args.tickArrayUpperStartIndex,
      liquidity: args.liquidity,
      amount0Max: args.amount0Max,
      amount1Max: args.amount1Max,
      withMetadata: args.withMetadata,
      baseFlag: args.baseFlag,
    },
    buffer
  )
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len)
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
