import { RayClIx } from "@raygauge/ray-cl-ix"
import { createAmmConfigIx, createPool, getPoolState } from "./cl-util"
import {
  BankrunClient,
  bankrunPrelude,
  createATA,
  createMint,
  loadLocalKey,
  logBlock,
  mintTo,
  signSendConfirm,
} from "./util"
import { accounts } from "@raygauge/ray-cl-idl"
import { web3 } from "@coral-xyz/anchor"
import { TOKEN_PROGRAM_ID } from "@solana/spl-token"
import { TickUtils } from "@raydium-io/raydium-sdk-v2"
import Decimal from "decimal.js"
import { RayClPda } from "@raygauge/ray-cl-pda"
import { expect } from "chai"

async function prelude() {
  const { client, provider } = await bankrunPrelude()
  const admin = await loadLocalKey("cl_admin.json", client)

  return { admin, client, provider }
}

describe("concentrated liquidity", () => {
  it("uses the cl swap program", async () => {
    const { admin, client } = await prelude()

    const ix = createAmmConfigIx(0, admin.publicKey)

    await logBlock("creating amm config", () => signSendConfirm(client, [ix], admin))

    const { poolState, token1, token0 } = await logBlock("creating pool", () => createPool(client, admin, 0))

    await logBlock("initializing operation", () => initOperation({ client, admin }))

    const ata0 = await logBlock("creating ata 0", () =>
      createATA({ client, owner: admin.publicKey, mint: token0.publicKey, tokenProgram: TOKEN_PROGRAM_ID }),
    )

    const ata1 = await logBlock("creating ata 1", () =>
      createATA({ client, owner: admin.publicKey, mint: token1.publicKey, tokenProgram: TOKEN_PROGRAM_ID }),
    )

    await logBlock("minting token 0", () =>
      mintTo({ client, mint: token0.publicKey, authority: admin, dst: ata0, amount: 100_000_000 }),
    )
    await logBlock("minting token 1", () =>
      mintTo({ client, mint: token1.publicKey, authority: admin, dst: ata1, amount: 100_000_000 }),
    )

    const poolAccount = await getPoolState(client, poolState)
    console.log("curPrice", poolAccount.price)
    console.log("tickCurrent", poolAccount.tickCurrent)

    const poolInfo: any = {
      mintA: { decimals: 6 },
      mintB: { decimals: 6 },
      config: { tickSpacing: 8 },
    }

    const rewardTokenMint = web3.Keypair.generate()
    await logBlock("creating reward token", () =>
      createMint({
        client,
        payer: admin,
        authority: admin.publicKey,
        decimals: 6,
        mint: rewardTokenMint,
      }),
    )

    const rewardTokenAta = await logBlock("creating reward token ata", () =>
      createATA({ client, owner: admin.publicKey, mint: rewardTokenMint.publicKey, tokenProgram: TOKEN_PROGRAM_ID }),
    )

    await logBlock("minting reward token", () =>
      mintTo({
        client,
        mint: rewardTokenMint.publicKey,
        authority: admin,
        dst: rewardTokenAta,
        amount: 100_000_000_000_000,
      }),
    )

    const now = Math.floor(Date.now() / 1000)
    await logBlock("initializing reward", () =>
      initializeReward({
        client,
        admin,
        poolState,
        rewardTokenMint: rewardTokenMint.publicKey,
        openTime: now + 10,
        endTime: now + 60 * 24 * 60 * 60,
        emissionsPerSecond: 1,
      }),
    )

    // Open a position with a price range of 0.5 to 2
    const tickLo = TickUtils.getPriceAndTick({ poolInfo, price: new Decimal(0.5), baseIn: true })
    const tickHi = TickUtils.getPriceAndTick({ poolInfo, price: new Decimal(2), baseIn: true })

    const { positionNftMint } = await logBlock("opening position", () =>
      openPosition({
        client,
        owner: admin,
        poolState,
        tokenMint0: token0.publicKey,
        tokenMint1: token1.publicKey,
        tickLo: tickLo.tick,
        tickHi: tickHi.tick,
        liquidity: 10_000,
      }),
    )

    // the timer for the reward starts in 10 seconds
    await client.advanceClock(1011)
    await client.advanceSlot()
    await logBlock("increasing liquidity", () =>
      increaseLiquidity({ client, owner: admin, poolState, positionNftMint, liquidity: 10_000n }),
    )

    await logBlock("updating reward", () => updateReward({ client, admin, poolState, nftMint: positionNftMint }))

    const rayClPda = new RayClPda()
    const personalPosition = rayClPda.personalPosition({ nftMint: positionNftMint })
    const personalPositionAccount = await accounts.PersonalPositionState.fetch(client.getConnection(), personalPosition)
    // there should be 1000 reward tokens owed, give or take 1 with the clock drift
    expect(personalPositionAccount.rewardInfos[0].rewardAmountOwed.toNumber()).to.be.closeTo(1000, 1)
  })
})

async function initOperation({ client, admin }: { client: BankrunClient; admin: web3.Keypair }) {
  const ixs = new RayClIx()
  const ix = ixs.createOperationAccount({ admin: admin.publicKey })
  await signSendConfirm(client, [ix], admin)
}

async function updateReward({
  client,
  admin,
  poolState,
  nftMint,
}: {
  client: BankrunClient
  admin: web3.Keypair
  poolState: web3.PublicKey
  nftMint: web3.PublicKey
}) {
  const ixs = new RayClIx()
  const personalPosition = ixs.pda.personalPosition({ nftMint })
  const personalPositionAccount = await accounts.PersonalPositionState.fetch(client.getConnection(), personalPosition)
  const tickLo = personalPositionAccount.tickLowerIndex
  const tickHi = personalPositionAccount.tickUpperIndex
  const protocolPosition = ixs.pda.protocolPosition({
    pool: poolState,
    tickLo,
    tickHi,
  })

  const ix = ixs.updatePersonalRewards({ poolState, personalPosition, protocolPosition, tickLo, tickHi })
  await signSendConfirm(client, [ix], admin)
}

async function initializeReward({
  client,
  admin,
  poolState,
  rewardTokenMint,
  openTime,
  endTime,
  emissionsPerSecond,
}: {
  client: BankrunClient
  admin: web3.Keypair
  poolState: web3.PublicKey
  rewardTokenMint: web3.PublicKey
  openTime: number
  endTime: number
  emissionsPerSecond: number
}) {
  const ixs = new RayClIx()
  const ix = ixs.initializeReward({
    poolState,
    rewardTokenMint,
    funder: admin.publicKey,
    openTime,
    endTime,
    emissionsPerSecond,
  })
  await signSendConfirm(client, [ix], admin)
}

export async function openPositionSmart({
  client,
  owner,
  poolState,
  priceLo,
  priceHi,
  liquidity,
}: {
  client: BankrunClient
  owner: web3.Keypair
  poolState: web3.PublicKey
  /** Price of token 0 in token 1 */
  priceLo: number
  /** Price of token 0 in token 1 */
  priceHi: number
  liquidity: number
}) {
  const poolAccount = await getPoolState(client, poolState)
  const poolInfo: any = {
    mintA: { decimals: 6 },
    mintB: { decimals: 6 },
    config: { tickSpacing: 8 },
  }

  const tickLo = TickUtils.getPriceAndTick({ poolInfo, price: new Decimal(priceLo), baseIn: true })
  const tickHi = TickUtils.getPriceAndTick({ poolInfo, price: new Decimal(priceHi), baseIn: true })

  return openPosition({
    client,
    owner,
    poolState,
    tokenMint0: poolAccount.account.tokenMint0,
    tokenMint1: poolAccount.account.tokenMint1,
    tickLo: tickLo.tick,
    tickHi: tickHi.tick,
    liquidity,
  })
}

async function openPosition({
  client,
  owner,
  poolState,
  tokenMint0,
  tokenMint1,
  tickLo,
  tickHi,
  liquidity,
}: {
  client: BankrunClient
  owner: web3.Keypair
  poolState: web3.PublicKey
  tokenMint0: web3.PublicKey
  tokenMint1: web3.PublicKey
  tickLo: number
  tickHi: number
  liquidity: number
}) {
  const ixs = new RayClIx()

  const { ix, positionNftMint } = ixs.openPosition({
    owner: owner.publicKey,
    poolState,
    tokenMint0,
    tokenMint1,
    tickLo,
    tickHi,
    liquidity,
  })

  await signSendConfirm(client, [ix], owner, [positionNftMint])

  return { positionNftMint: positionNftMint.publicKey }
}

export async function increaseLiquidity({
  client,
  owner,
  poolState,
  positionNftMint,
  liquidity,
}: {
  client: BankrunClient
  owner: web3.Keypair
  poolState: web3.PublicKey
  positionNftMint: web3.PublicKey
  liquidity: bigint
}) {
  const ixs = new RayClIx()

  const personalPosition = ixs.pda.personalPosition({ nftMint: positionNftMint })
  const personalPositionAccount = await accounts.PersonalPositionState.fetch(client.getConnection(), personalPosition)
  const poolAccount = await getPoolState(client, poolState)
  const tickLo = personalPositionAccount.tickLowerIndex
  const tickHi = personalPositionAccount.tickUpperIndex
  const tokenMint0 = poolAccount.account.tokenMint0
  const tokenMint1 = poolAccount.account.tokenMint1

  const ix = ixs.increaseLiquidity({
    owner: owner.publicKey,
    liquidity,
    positionNftMint,
    poolState,
    tickLo,
    tickHi,
    tokenMint0,
    tokenMint1,
    amount0Max: liquidity,
    amount1Max: liquidity,
  })
  await signSendConfirm(client, [ix], owner)
}

export async function setUpClSwap({ client, clAdmin }: { client: BankrunClient; clAdmin: web3.Keypair }) {
  const ammIx = createAmmConfigIx(0, clAdmin.publicKey)

  await logBlock("creating amm config", () => signSendConfirm(client, [ammIx], clAdmin))

  await logBlock("initializing operation", () => initOperation({ client, admin: clAdmin }))
}

export async function createPoolWithTrackerRewarder({
  client,
  clAdmin,
}: {
  client: BankrunClient
  clAdmin: web3.Keypair
}) {
  const { poolState, token1, token0 } = await logBlock("creating pool", () => createPool(client, clAdmin, 0))

  const rewardTokenMint = web3.Keypair.generate()
  await logBlock("creating reward token", () =>
    createMint({
      client,
      payer: clAdmin,
      authority: clAdmin.publicKey,
      decimals: 6,
      mint: rewardTokenMint,
    }),
  )

  const rewardTokenAta = await logBlock("creating reward token ata", () =>
    createATA({ client, owner: clAdmin.publicKey, mint: rewardTokenMint.publicKey, tokenProgram: TOKEN_PROGRAM_ID }),
  )

  await logBlock("minting reward token", () =>
    mintTo({
      client,
      mint: rewardTokenMint.publicKey,
      authority: clAdmin,
      dst: rewardTokenAta,
      amount: 100_000_000_000_000,
    }),
  )

  const now = Math.floor(Date.now() / 1000)
  await logBlock("initializing reward", () =>
    initializeReward({
      client,
      admin: clAdmin,
      poolState,
      rewardTokenMint: rewardTokenMint.publicKey,
      openTime: now + 10,
      endTime: now + 60 * 24 * 60 * 60,
      emissionsPerSecond: 1,
    }),
  )

  return { poolState, rewardTokenMint, rewardTokenAta, token0, token1 }
}
