import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface ClWithdrawRayAccounts {
  /** Prove ownership of the position by owning the NFT */
  nftOwner: PublicKey
  /**
   * The token account for the NFT
   * The constraint links it to the personal position
   * This NFT token account is essentially a junction table connecting the signer to the personal position
   */
  nftAccount: PublicKey
  /** The position with the CLMM pool */
  personalPosition: PublicKey
  /**
   * Global, read-only GaugeConfig
   * Constrains the ray_hopper
   */
  gaugeConfig: PublicKey
  /** Constrain that the personal_rewarder is linked to the NFT owner via the liquidity position */
  personalRewarder: PublicKey
  rayHopper: PublicKey
  rayDst: PublicKey
  tokenProgram: PublicKey
}

/** CL: Withdraw earned RAY from the hopper and zero-out staged ray in the rewarder */
export function clWithdrawRay(
  accounts: ClWithdrawRayAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.nftOwner, isSigner: true, isWritable: false },
    { pubkey: accounts.nftAccount, isSigner: false, isWritable: false },
    { pubkey: accounts.personalPosition, isSigner: false, isWritable: false },
    { pubkey: accounts.gaugeConfig, isSigner: false, isWritable: false },
    { pubkey: accounts.personalRewarder, isSigner: false, isWritable: true },
    { pubkey: accounts.rayHopper, isSigner: false, isWritable: true },
    { pubkey: accounts.rayDst, isSigner: false, isWritable: true },
    { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
  ]
  const identifier = Buffer.from([57, 216, 119, 145, 183, 155, 166, 148])
  const data = identifier
  const ix = new TransactionInstruction({ keys, programId, data })
  return ix
}
