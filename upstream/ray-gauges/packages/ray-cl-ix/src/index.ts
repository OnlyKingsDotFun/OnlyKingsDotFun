import { BN, web3 } from "@coral-xyz/anchor"
import { METADATA_PROGRAM_ID, Q64, TickUtils } from "@raydium-io/raydium-sdk-v2"
import { CL_SWAP_PROGRAM_ID, instructions } from "@raygauge/ray-cl-idl"
import { RayClPda } from "@raygauge/ray-cl-pda"
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token"
import Decimal from "decimal.js"

const OBSERVATION_LEN = 4 + 16 + 16 + 16
const OBSERVATION_NUM = 1000
const OBSERVATION_STATE_LEN = 8 + 1 + 32 + OBSERVATION_LEN * OBSERVATION_NUM + 16 * 5

export function createObservationIx(payer: web3.PublicKey) {
  const kp = web3.Keypair.generate()
  const ix = web3.SystemProgram.createAccount({
    fromPubkey: payer,
    space: OBSERVATION_STATE_LEN,
    newAccountPubkey: kp.publicKey,
    programId: CL_SWAP_PROGRAM_ID,
    lamports: 25e9,
  })

  return { kp, ix }
}

export class RayClIx {
  public pda = new RayClPda()

  createOperationAccount({ admin }: { admin: web3.PublicKey }) {
    const operationState = this.pda.operation()
    const ix = instructions.createOperationAccount({
      owner: admin,
      systemProgram: web3.SystemProgram.programId,
      operationState,
    })
    return ix
  }

  createPool({
    payer,
    ammConfigIndex,
    mint0,
    mint1,
    sqrtPriceX64,
  }: {
    payer: web3.PublicKey
    ammConfigIndex: number
    mint0: web3.PublicKey
    mint1: web3.PublicKey
    sqrtPriceX64: BN
  }) {
    const poolState = this.pda.pool({ index: ammConfigIndex, mint0, mint1 })
    const observationState = this.pda.observation({ pool: poolState })
    const ammConfig = this.pda.ammConfig({ index: ammConfigIndex })
    const tokenVault0 = this.pda.poolVault({ pool: poolState, mint: mint0 })
    const tokenVault1 = this.pda.poolVault({ pool: poolState, mint: mint1 })
    const tickArrayBitmap = this.pda.tickArrayBitmap({ pool: poolState })

    const ix = instructions.createPool(
      { sqrtPriceX64, openTime: new BN(0) },
      {
        poolCreator: payer,
        poolState,
        ammConfig,
        tokenMint0: mint0,
        tokenMint1: mint1,
        tokenVault0,
        tokenVault1,
        observationState,
        tickArrayBitmap,
        tokenProgram0: TOKEN_PROGRAM_ID,
        tokenProgram1: TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      },
    )
    return ix
  }

  updatePersonalRewards({
    poolState,
    personalPosition,
    protocolPosition,
    tickLo,
    tickHi,
    tickSpacing = 8,
  }: {
    poolState: web3.PublicKey
    personalPosition: web3.PublicKey
    protocolPosition: web3.PublicKey
    tickLo: number
    tickHi: number
    tickSpacing?: number
  }) {
    const tickLoIndex = TickUtils.getTickArrayStartIndexByTick(tickLo, tickSpacing)
    const tickHiIndex = TickUtils.getTickArrayStartIndexByTick(tickHi, tickSpacing)
    const tickArrayLowerLoader = this.pda.tickArrayAccount({ pool: poolState, index: tickLoIndex })
    const tickArrayUpperLoader = this.pda.tickArrayAccount({ pool: poolState, index: tickHiIndex })
    const ix = instructions.updatePersonalRewards({
      poolState,
      personalPosition,
      protocolPosition,
      tickArrayLowerLoader,
      tickArrayUpperLoader,
    })
    return ix
  }

  initializeReward({
    poolState,
    rewardTokenMint,
    funder,
    openTime,
    endTime,
    emissionsPerSecond,
  }: {
    poolState: web3.PublicKey
    rewardTokenMint: web3.PublicKey
    funder: web3.PublicKey
    openTime: number
    endTime: number
    emissionsPerSecond: number
  }) {
    const rewardTokenVault = this.pda.rewardVault({ pool: poolState, mint: rewardTokenMint })

    const funderTokenAccount = getAssociatedTokenAddressSync(rewardTokenMint, funder)
    const ammConfig = this.pda.ammConfig({ index: 0 })
    const operationState = this.pda.operation()

    const emissionsPerSecondX64 = toQ64(emissionsPerSecond)
    console.log("emissionsPerSecondX64", emissionsPerSecondX64.toString())
    console.log("openTime", openTime)
    console.log("endTime", endTime)
    const param = {
      openTime: new BN(openTime),
      endTime: new BN(endTime),
      emissionsPerSecondX64,
    }
    const ix = instructions.initializeReward(
      { param },
      {
        rewardFunder: funder,
        poolState,
        rewardTokenVault,
        rewardTokenMint,
        funderTokenAccount,
        ammConfig,
        operationState,
        rewardTokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      },
    )
    return ix
  }

  openPosition({
    owner,
    poolState,
    tokenMint0,
    tokenMint1,
    tickLo,
    tickHi,
    liquidity,
    tickSpacing = 8,
  }: {
    owner: web3.PublicKey
    poolState: web3.PublicKey
    tokenMint0: web3.PublicKey
    tokenMint1: web3.PublicKey
    tickLo: number
    tickHi: number
    liquidity: number
    tickSpacing?: number
  }) {
    const tickLoIndex = TickUtils.getTickArrayStartIndexByTick(tickLo, tickSpacing)
    const tickHiIndex = TickUtils.getTickArrayStartIndexByTick(tickHi, tickSpacing)
    const positionNftMint = web3.Keypair.generate()
    const positionNftAccount = getAssociatedTokenAddressSync(positionNftMint.publicKey, owner)
    const tickArrayLower = this.pda.tickArrayAccount({ pool: poolState, index: tickLoIndex })
    const tickArrayUpper = this.pda.tickArrayAccount({ pool: poolState, index: tickHiIndex })
    const protocolPosition = this.pda.protocolPosition({ pool: poolState, tickLo, tickHi })
    const personalPosition = this.pda.personalPosition({ nftMint: positionNftMint.publicKey })
    const tokenAccount0 = getAssociatedTokenAddressSync(tokenMint0, owner)
    const tokenAccount1 = getAssociatedTokenAddressSync(tokenMint1, owner)
    const tokenVault0 = this.pda.poolVault({ pool: poolState, mint: tokenMint0 })
    const tokenVault1 = this.pda.poolVault({ pool: poolState, mint: tokenMint1 })

    const amount0Max = new BN(liquidity)
    const amount1Max = new BN(liquidity)
    const withMetadata = false
    const baseFlag = false
    const metadataAccount = web3.PublicKey.unique()

    const ix = instructions.openPositionV2(
      {
        liquidity: new BN(liquidity),
        amount0Max,
        amount1Max,
        tickLowerIndex: tickLo,
        tickUpperIndex: tickHi,
        tickArrayLowerStartIndex: tickLoIndex,
        tickArrayUpperStartIndex: tickHiIndex,
        withMetadata,
        baseFlag,
      },
      {
        payer: owner,
        positionNftOwner: owner,
        positionNftMint: positionNftMint.publicKey,
        positionNftAccount,
        protocolPosition,
        tickArrayLower,
        tickArrayUpper,
        personalPosition,
        tokenAccount0,
        tokenAccount1,
        tokenVault0,
        tokenVault1,
        metadataAccount,
        poolState,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        metadataProgram: METADATA_PROGRAM_ID,
        tokenProgram2022: TOKEN_2022_PROGRAM_ID,
        vault0Mint: tokenMint0,
        vault1Mint: tokenMint1,
      },
    )
    return { ix, positionNftMint }
  }

  increaseLiquidity({
    owner,
    liquidity,
    amount0Max,
    amount1Max,
    poolState,
    positionNftMint,
    tickLo,
    tickHi,
    tokenMint0,
    tokenMint1,
    tickSpacing = 8,
  }: {
    owner: web3.PublicKey
    liquidity: bigint
    amount0Max: bigint
    amount1Max: bigint
    poolState: web3.PublicKey
    positionNftMint: web3.PublicKey
    tickLo: number
    tickHi: number
    tokenMint0: web3.PublicKey
    tokenMint1: web3.PublicKey
    tickSpacing?: number
  }) {
    const tickLoIndex = TickUtils.getTickArrayStartIndexByTick(tickLo, tickSpacing)
    const tickHiIndex = TickUtils.getTickArrayStartIndexByTick(tickHi, tickSpacing)
    const tickArrayLower = this.pda.tickArrayAccount({ pool: poolState, index: tickLoIndex })
    const tickArrayUpper = this.pda.tickArrayAccount({ pool: poolState, index: tickHiIndex })
    const tokenAccount0 = getAssociatedTokenAddressSync(tokenMint0, owner)
    const tokenAccount1 = getAssociatedTokenAddressSync(tokenMint1, owner)
    const tokenVault0 = this.pda.poolVault({ pool: poolState, mint: tokenMint0 })
    const tokenVault1 = this.pda.poolVault({ pool: poolState, mint: tokenMint1 })
    const nftAccount = getAssociatedTokenAddressSync(positionNftMint, owner)
    const personalPosition = this.pda.personalPosition({ nftMint: positionNftMint })
    const protocolPosition = this.pda.protocolPosition({ pool: poolState, tickLo, tickHi })

    const ix = instructions.increaseLiquidityV2(
      {
        liquidity: new BN(liquidity.toString()),
        amount0Max: new BN(amount0Max.toString()),
        amount1Max: new BN(amount1Max.toString()),
        baseFlag: false,
      },
      {
        nftOwner: owner,
        nftAccount,
        poolState,
        tickArrayLower,
        tickArrayUpper,
        tokenAccount0,
        tokenAccount1,
        tokenVault0,
        tokenVault1,
        personalPosition,
        protocolPosition,
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram2022: TOKEN_2022_PROGRAM_ID,
        vault0Mint: tokenMint0,
        vault1Mint: tokenMint1,
      },
    )
    return ix
  }
}

function toQ64(num: number) {
  return new BN(new Decimal(num).mul(Q64.toString()).floor().toString())
}
