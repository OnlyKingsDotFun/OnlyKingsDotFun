import { web3 } from "@coral-xyz/anchor"
import { depositRay, initReactor, initReactorConfig, mintRayToUser } from "./reactor.test"
import {
  BankrunClient,
  bankrunPrelude,
  createATA,
  initUser,
  loadLocalKey,
  logBlock,
  mintTo,
  signSendConfirm,
  transferCoins,
} from "./util"
import {
  GaugeConfig,
  initGaugeConfigIx,
  PersonalGauge,
  PoolGauge,
  PersonalRewarderCpSdk,
  PersonalRewarderClSdk,
} from "@raygauge/gauge-sdk"
import { initPool } from "./cp-swap.test"
import { expect } from "chai"
import { depositLpTokens, initLpEscrow, initPersonalPosition, syncPersonalPosition } from "./cp-lp-escrow.test"
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token"
import { createPoolWithTrackerRewarder, increaseLiquidity, openPositionSmart, setUpClSwap } from "./cl-swap.test"
import { accounts } from "@raygauge/ray-cl-idl"
import { RayClPda } from "@raygauge/ray-cl-pda"

async function prelude(rayPerDay: bigint = 360n) {
  const { client, provider, context } = await bankrunPrelude()
  const admin = await loadLocalKey("tests/fixtures/reactor-admin-dev.json", client)
  const cpSwapAdmin = await loadLocalKey("tests/fixtures/cp_admin.json", client)
  const clAdmin = await loadLocalKey("cl_admin.json", client)

  const { ray, tenantSdk: reactorTenantSdk } = await logBlock("init reactor tenant", () =>
    initReactorConfig({ client, admin }),
  )

  const gaugeConfig = await logBlock("init global gauge config", () =>
    initGlobalGaugeConfig({
      client,
      payer: admin,
      rayMint: ray,
      rayPerDay,
    }),
  )

  return { client, provider, context, admin, clAdmin, cpSwapAdmin, ray, reactorTenantSdk, gaugeConfig }
}

describe("cl gauge", () => {
  it("inits a pool gauge", async () => {
    const { client, clAdmin, gaugeConfig } = await prelude()
    // set up cl swap config & operation account
    await setUpClSwap({ client, clAdmin })

    // create pool
    const { poolState, token1, token0 } = await logBlock("creating pool with rewarder", () =>
      createPoolWithTrackerRewarder({ client, clAdmin }),
    )

    // init pool gauge
    const poolGauge = await logBlock("init pool gauge", () =>
      initPoolGauge({ client, payer: clAdmin, poolId: poolState, gaugeConfig }),
    )

    const bilbo = await initUser(client)

    const bilboToken0Ata = await logBlock("create token 0 ata for bilbo", () =>
      createATA({
        client,
        owner: bilbo.publicKey,
        mint: token0.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      }),
    )
    const bilboToken1Ata = await logBlock("create token 1 ata for bilbo", () =>
      createATA({
        client,
        owner: bilbo.publicKey,
        mint: token1.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      }),
    )

    await logBlock("mint token 0 to bilbo", () =>
      mintTo({
        client,
        mint: token0.publicKey,
        dst: bilboToken0Ata,
        amount: 100e6,
        authority: clAdmin,
        tokenProgram: TOKEN_PROGRAM_ID,
      }),
    )

    await logBlock("mint token 1 to bilbo", () =>
      mintTo({
        client,
        mint: token1.publicKey,
        dst: bilboToken1Ata,
        amount: 100e6,
        authority: clAdmin,
        tokenProgram: TOKEN_PROGRAM_ID,
      }),
    )

    const { positionNftMint } = await logBlock("open position", () =>
      openPositionSmart({ client, owner: bilbo, poolState, priceLo: 0.7, priceHi: 1.2, liquidity: 1_000 }),
    )

    // earn some time units
    // the rewarder starts 10 seconds from now
    // so this should be about 1000 time units
    await client.advanceClock(1010)
    await client.advanceSlot()

    await increaseLiquidity({ client, owner: bilbo, poolState, positionNftMint, liquidity: 1_000n })

    const personalRewarder = await logBlock("init personal rewarder cl", () =>
      initPersonalRewarderCl({ client, poolGauge, owner: bilbo, nftMint: positionNftMint }),
    )

    // the rewarder should have seen 1000 time units (give or take a clock drift)
    expect(parseFloat(personalRewarder.lastSeenTimeUnits)).to.be.closeTo(1000, 3)
  })
})

describe("cp gauge ", () => {
  it("inits a pool gauge", async () => {
    const { client, provider, admin, cpSwapAdmin, gaugeConfig } = await prelude()

    const { pool: poolA } = await logBlock("init pool A", () => initPool({ admin: cpSwapAdmin, client, provider }))

    const poolGaugeA = await logBlock("init pool gauge A", () =>
      initPoolGauge({ client, payer: admin, poolId: poolA, gaugeConfig }),
    )

    expect(gaugeConfig.index).to.equal("0")
    expect(gaugeConfig.totalVotes.toString()).to.equal("0")

    expect(poolGaugeA.poolId.equals(poolA)).to.be.true
    expect(poolGaugeA.totalRayEmitted.toString()).to.equal("0")
    expect(poolGaugeA.totalVotes.toString()).to.equal("0")
    expect(poolGaugeA.lastSeenGlobalIndex).to.equal("0")
  })

  it("pledges & unpledges votes to a pool gauge", async () => {
    const { client, provider, admin, cpSwapAdmin, gaugeConfig, reactorTenantSdk, ray } = await prelude()

    const { pool: poolA, lpMint } = await logBlock("init pool A", () =>
      initPool({ admin: cpSwapAdmin, client, provider }),
    )

    // escrow sdk for CP LP tokens
    // const cpTrackerSdk = await logBlock("init escrow A", () => initLpEscrow({ client, poolId: poolA }))

    const poolGaugeA = await logBlock("init pool gauge A", () =>
      initPoolGauge({ client, payer: admin, poolId: poolA, gaugeConfig }),
    )

    // Create user with a reactor
    const bilbo = await initUser(client)
    const frodo = await initUser(client)

    // Initialize reactor for bilbo
    const bilboReactorSdk = await logBlock("init reactor for bilbo", () =>
      initReactor({ client, owner: bilbo, tenantSdk: reactorTenantSdk }),
    )

    // Initialize reactor for frodo
    const frodoReactorSdk = await logBlock("init reactor for frodo", () =>
      initReactor({ client, owner: frodo, tenantSdk: reactorTenantSdk }),
    )

    // Mint 360 RAY to Bilbo
    await logBlock("mint ray to bilbo", () => mintRayToUser({ client, ray, user: bilbo, admin, amount: 360 }))
    await logBlock("mint ray to frodo", () => mintRayToUser({ client, ray, user: frodo, admin, amount: 360 }))

    // deposit 360 RAY to Reactor
    // now Bilbo has 360 vote power
    await logBlock("deposit ray to Bilbo reactor", () =>
      depositRay({ client, reactorSdk: bilboReactorSdk, rayMint: ray, owner: bilbo, amount: 360 }),
    )

    // deposit 360 RAY to Reactor
    // now Frodo has 360 vote power
    await logBlock("deposit ray to Frodo reactor", () =>
      depositRay({ client, reactorSdk: frodoReactorSdk, rayMint: ray, owner: frodo, amount: 360 }),
    )

    // init personal gauge for bilbo
    const bilboPersonalGauge = await logBlock("init personal gauge for bilbo", () =>
      initPersonalGauge({ client, poolId: poolA, poolGauge: poolGaugeA, owner: bilbo }),
    )

    // init personal gauge for frodo
    const frodoPersonalGauge = await logBlock("init personal gauge for frodo", () =>
      initPersonalGauge({ client, poolId: poolA, poolGauge: poolGaugeA, owner: frodo }),
    )

    // add 100 votes on Bilbo personal gauge
    await logBlock("change votes on Bilbo personal gauge", () =>
      changeVotesOnPersonalGauge({ client, personalGauge: bilboPersonalGauge, owner: bilbo, amount: 100n }),
    )

    // reload the personal gauge, pool gauge, and gauge config
    await bilboPersonalGauge.reload(client.getConnection())
    await poolGaugeA.reload(client.getConnection())
    await gaugeConfig.reload(client.getConnection())
    await bilboReactorSdk.reload(client.getConnection())
    await frodoReactorSdk.reload(client.getConnection())
    await frodoPersonalGauge.reload(client.getConnection())

    expect(bilboReactorSdk.lockedVotes.toString()).to.equal("100")
    expect(bilboPersonalGauge.votes.toString()).to.equal("100")
    expect(poolGaugeA.totalVotes.toString()).to.equal("100")
    expect(gaugeConfig.totalVotes.toString()).to.equal("100")
    expect(frodoReactorSdk.lockedVotes.toString()).to.equal("0")
    expect(frodoPersonalGauge.votes.toString()).to.equal("0")

    // remove 70 votes on Bilbo personal gauge
    await logBlock("change votes on Bilbo personal gauge", () =>
      changeVotesOnPersonalGauge({ client, personalGauge: bilboPersonalGauge, owner: bilbo, amount: -70n }),
    )

    await bilboPersonalGauge.reload(client.getConnection())
    await poolGaugeA.reload(client.getConnection())
    await gaugeConfig.reload(client.getConnection())
    await bilboReactorSdk.reload(client.getConnection())
    await frodoReactorSdk.reload(client.getConnection())
    await frodoPersonalGauge.reload(client.getConnection())

    // check that the reactor and personal gauge have the correct values
    expect(bilboReactorSdk.lockedVotes.toString()).to.equal("30")
    expect(bilboPersonalGauge.votes.toString()).to.equal("30")
    expect(poolGaugeA.totalVotes.toString()).to.equal("30")
    expect(gaugeConfig.totalVotes.toString()).to.equal("30")
    expect(frodoReactorSdk.lockedVotes.toString()).to.equal("0")
    expect(frodoPersonalGauge.votes.toString()).to.equal("0")

    // frodo pledges 100 votes to his personal gauge
    await logBlock("frodo pledges 100 votes to his personal gauge", () =>
      changeVotesOnPersonalGauge({ client, personalGauge: frodoPersonalGauge, owner: frodo, amount: 100n }),
    )

    await frodoPersonalGauge.reload(client.getConnection())
    await poolGaugeA.reload(client.getConnection())
    await gaugeConfig.reload(client.getConnection())
    await frodoReactorSdk.reload(client.getConnection())

    expect(frodoReactorSdk.lockedVotes.toString()).to.equal("100")
    expect(frodoPersonalGauge.votes.toString()).to.equal("100")
    expect(poolGaugeA.totalVotes.toString()).to.equal("130")
    expect(gaugeConfig.totalVotes.toString()).to.equal("130")
  })

  it("earns ray from gauges", async () => {
    const { client, provider, admin, cpSwapAdmin, gaugeConfig, reactorTenantSdk, ray } = await prelude()

    let now = Date.now() / 1000

    const { pool: poolA, lpMint: lpMintA } = await logBlock("init pool A", () =>
      initPool({ admin: cpSwapAdmin, client, provider }),
    )

    const { pool: poolB, lpMint: lpMintB } = await logBlock("init pool B", () =>
      initPool({ admin: cpSwapAdmin, client, provider }),
    )

    // escrow sdk for CP LP tokens
    const cpTrackerSdkA = await logBlock("init escrow A", () => initLpEscrow({ client, poolId: poolA }))
    const cpTrackerSdkB = await logBlock("init escrow B", () => initLpEscrow({ client, poolId: poolB }))

    const poolGaugeA = await logBlock("init pool gauge A", () =>
      initPoolGauge({ client, payer: admin, poolId: poolA, gaugeConfig }),
    )

    const poolGaugeB = await logBlock("init pool gauge B", () =>
      initPoolGauge({ client, payer: admin, poolId: poolB, gaugeConfig }),
    )

    // Create user with a reactor
    const bilbo = await initUser(client)
    const frodo = await initUser(client)

    // Initialize reactor for bilbo
    const bilboReactorSdk = await logBlock("init reactor for bilbo", () =>
      initReactor({ client, owner: bilbo, tenantSdk: reactorTenantSdk }),
    )

    // Initialize reactor for frodo
    const frodoReactorSdk = await logBlock("init reactor for frodo", () =>
      initReactor({ client, owner: frodo, tenantSdk: reactorTenantSdk }),
    )

    // Mint 360 RAY to Bilbo
    await logBlock("mint ray to bilbo", () => mintRayToUser({ client, ray, user: bilbo, admin, amount: 360 }))
    await logBlock("mint ray to frodo", () => mintRayToUser({ client, ray, user: frodo, admin, amount: 360 }))

    // deposit 360 RAY to Reactor
    // now Bilbo has 360 vote power
    await logBlock("deposit ray to Bilbo reactor", () =>
      depositRay({ client, reactorSdk: bilboReactorSdk, rayMint: ray, owner: bilbo, amount: 360 }),
    )

    // deposit 360 RAY to Reactor
    // now Frodo has 360 vote power
    await logBlock("deposit ray to Frodo reactor", () =>
      depositRay({ client, reactorSdk: frodoReactorSdk, rayMint: ray, owner: frodo, amount: 360 }),
    )

    // Init personal gauges
    const bilboPersonalGaugeA = await logBlock("init personal gauge A for bilbo", () =>
      initPersonalGauge({ client, poolId: poolA, poolGauge: poolGaugeA, owner: bilbo }),
    )

    const frodoPersonalGaugeA = await logBlock("init personal gauge A for frodo", () =>
      initPersonalGauge({ client, poolId: poolA, poolGauge: poolGaugeA, owner: frodo }),
    )

    const bilboPersonalGaugeB = await logBlock("init personal gauge B for bilbo", () =>
      initPersonalGauge({ client, poolId: poolB, poolGauge: poolGaugeB, owner: bilbo }),
    )

    const frodoPersonalGaugeB = await logBlock("init personal gauge B for frodo", () =>
      initPersonalGauge({ client, poolId: poolB, poolGauge: poolGaugeB, owner: frodo }),
    )

    const lpPersonalPositionABilbo = await logBlock("init LP Escrow A personal position for bilbo", () =>
      initPersonalPosition({ client, owner: bilbo, escrowSdk: cpTrackerSdkA }),
    )

    const lpPersonalPositionAFrodo = await logBlock("init LP Escrow A personal position for frodo", () =>
      initPersonalPosition({ client, owner: frodo, escrowSdk: cpTrackerSdkA }),
    )

    const lpPersonalPositionBBilbo = await logBlock("init LP Escrow B personal position for bilbo", () =>
      initPersonalPosition({ client, owner: bilbo, escrowSdk: cpTrackerSdkB }),
    )

    const lpPersonalPositionBFrodo = await logBlock("init LP Escrow B personal position for frodo", () =>
      initPersonalPosition({ client, owner: frodo, escrowSdk: cpTrackerSdkB }),
    )

    // Transfer 100 LP tokens to users
    const lpAtaABilbo = await logBlock("transfer lp tokens A to bilbo", () =>
      transferLpTokensToUser({ client, user: bilbo, lpMint: lpMintA, cpSwapAdmin, amount: 100n }),
    )

    const lpAtaAFrodo = await logBlock("transfer lp tokens A to frodo", () =>
      transferLpTokensToUser({ client, user: frodo, lpMint: lpMintA, cpSwapAdmin, amount: 100n }),
    )

    const lpAtaBBilbo = await logBlock("transfer lp tokens B to bilbo", () =>
      transferLpTokensToUser({ client, user: bilbo, lpMint: lpMintB, cpSwapAdmin, amount: 100n }),
    )

    const lpAtaBFrodo = await logBlock("transfer lp tokens B to frodo", () =>
      transferLpTokensToUser({ client, user: frodo, lpMint: lpMintB, cpSwapAdmin, amount: 100n }),
    )

    // bilbo deposits 50 LP tokens to escrow A
    await logBlock("deposit lp tokens A to bilbo escrow", () =>
      depositLpTokens({
        client,
        signer: bilbo,
        personalPosition: lpPersonalPositionABilbo,
        lpSrc: lpAtaABilbo,
        amount: 50n,
      }),
    )

    // advance clock 1 day
    await client.advanceClock(24 * 60 * 60)
    await client.advanceSlot()
    now += 24 * 60 * 60

    // 0 RAY will be emitted because there are 0 votes on the pool gauge
    await gaugeConfig.reload(client.getConnection())
    await poolGaugeA.reload(client.getConnection())
    await lpPersonalPositionABilbo.reload(client.getConnection())

    expect(gaugeConfig.totalVotes.toString()).to.equal("0")
    expect(poolGaugeA.totalRayEmitted.toString()).to.equal("0")

    // check that bilbo has earned time-units
    // he has earned all the time units for the day
    await syncPersonalPosition({ client, personalPosition: lpPersonalPositionABilbo })
    await lpPersonalPositionABilbo.reload(client.getConnection())
    expect(parseInt(lpPersonalPositionABilbo.earnedTimeUnits)).to.equal(24 * 60 * 60)

    // init personal rewarder A for bilbo
    const personalRewarderABilbo = await logBlock("init personal rewarder A for bilbo", () =>
      initPersonalRewarderCp({ client, poolGauge: poolGaugeA, owner: bilbo }),
    )

    // check that the index is zero
    expect(personalRewarderABilbo.stagedRay.toString()).to.equal("0")
    // the time units have been synced with the pool gauge
    expect(personalRewarderABilbo.lastSeenTimeUnits).to.equal("86400")
    expect(personalRewarderABilbo.lastSeenTotalEmittedRay.toString()).to.equal("0")
    // the timestamp has been set to the current time
    expect(parseInt(personalRewarderABilbo.lastUpdatedTs.toString())).to.be.closeTo(now, 10)

    // accrue ray for bilbo
    // but he will get none, since there are 0 votes on the pool gauge A
    await logBlock("accrue ray for bilbo on gauge A", () =>
      accrueRay({ client, personalRewarder: personalRewarderABilbo }),
    )
    await personalRewarderABilbo.reload(client.getConnection())
    expect(personalRewarderABilbo.stagedRay.toString()).to.equal("0")
    expect(personalRewarderABilbo.lastSeenTotalEmittedRay.toString()).to.equal("0")
    expect(personalRewarderABilbo.lastSeenTimeUnits).to.equal("86400")

    // advance clock 1 day
    await client.advanceClock(24 * 60 * 60)
    await client.advanceSlot()
    now += 24 * 60 * 60

    // accrue ray for bilbo
    // he will still get none, since there are still 0 votes on the pool gauge A
    await logBlock("accrue ray for bilbo on gauge A", () =>
      accrueRay({ client, personalRewarder: personalRewarderABilbo }),
    )
    await client.advanceSlot()

    await personalRewarderABilbo.reload(client.getConnection())
    expect(personalRewarderABilbo.stagedRay.toString()).to.equal("0")
    expect(personalRewarderABilbo.lastSeenTotalEmittedRay.toString()).to.equal("0")
    // the time units have been updated, since his LP position has earned more
    expect(personalRewarderABilbo.lastSeenTimeUnits).to.equal("172800")

    // now vote 100 on the pool gauge A
    await logBlock("add 100 votes to pool gauge A", () =>
      changeVotesOnPersonalGauge({ client, personalGauge: bilboPersonalGaugeA, owner: bilbo, amount: 100n }),
    )

    // accrue ray for bilbo
    // he will still get none, since no time has passed
    await logBlock("accrue ray for bilbo on gauge A", () =>
      accrueRay({ client, personalRewarder: personalRewarderABilbo }),
    )
    await personalRewarderABilbo.reload(client.getConnection())
    await poolGaugeA.reload(client.getConnection())
    await gaugeConfig.reload(client.getConnection())

    expect(personalRewarderABilbo.stagedRay.toString()).to.equal("0")
    expect(personalRewarderABilbo.lastSeenTotalEmittedRay.toString()).to.equal("0")
    // the time units have been updated, since his LP position has earned more
    expect(personalRewarderABilbo.lastSeenTimeUnits).to.equal("172800")

    // no ray has been emitted yet
    expect(poolGaugeA.totalRayEmitted.toString()).to.equal("0")
    expect(parseInt(gaugeConfig.lastUpdatedTs.toString())).to.be.closeTo(now, 10)
    expect(parseInt(gaugeConfig.index)).to.equal(0)

    // advance clock 1 day
    await client.advanceClock(24 * 60 * 60)
    await client.advanceSlot()
    now += 24 * 60 * 60

    // accrue ray for bilbo
    // he will get some ray, since 1 day has passed
    await logBlock("accrue ray for bilbo on gauge A", () =>
      accrueRay({ client, personalRewarder: personalRewarderABilbo }),
    )
    await personalRewarderABilbo.reload(client.getConnection())
    await poolGaugeA.reload(client.getConnection())
    await gaugeConfig.reload(client.getConnection())

    // there is truncation from the division
    expect(personalRewarderABilbo.stagedRay.toString()).to.equal("359")
    // but the rewarder sees the correct total emitted ray
    expect(personalRewarderABilbo.lastSeenTotalEmittedRay.toString()).to.equal("360")
    // the timestamp is updated
    expect(parseInt(personalRewarderABilbo.lastUpdatedTs.toString())).to.be.closeTo(now, 10)
    expect(poolGaugeA.totalRayEmitted.toString()).to.equal("360")
    expect(parseInt(gaugeConfig.lastUpdatedTs.toString())).to.be.closeTo(now, 10)

    // frodo now votes on Gauge B
    await logBlock("frodo votes 50 on pool gauge B", () =>
      changeVotesOnPersonalGauge({ client, personalGauge: frodoPersonalGaugeB, owner: frodo, amount: 50n }),
    )

    // gauge A & B have their votes updated
    await poolGaugeA.reload(client.getConnection())
    await poolGaugeB.reload(client.getConnection())
    expect(poolGaugeA.totalVotes.toString()).to.equal("100")
    expect(poolGaugeB.totalVotes.toString()).to.equal("50")

    // advance clock 1 day
    await client.advanceClock(24 * 60 * 60)
    await client.advanceSlot()
    now += 24 * 60 * 60

    // 360 more RAY get emitted
    // 2/3 go to Pool A = 240
    // 1/3 go to Pool B = 120
    await logBlock("accrue ray for bilbo on gauge A", () =>
      accrueRay({ client, personalRewarder: personalRewarderABilbo }),
    )

    // must sync the pool index for gauge B in order to see the correct total emitted ray
    await logBlock("sync pool index for gauge B", () => syncPoolIndex({ client, poolGauge: poolGaugeB }))

    await personalRewarderABilbo.reload(client.getConnection())
    await poolGaugeA.reload(client.getConnection())
    await poolGaugeB.reload(client.getConnection())
    await gaugeConfig.reload(client.getConnection())

    expect(parseInt(personalRewarderABilbo.stagedRay.toString())).to.equal(359 + 239)
    expect(poolGaugeA.totalRayEmitted.toString()).to.equal("600")
    expect(poolGaugeB.totalRayEmitted.toString()).to.equal("120")

    // now Frodo creates his own personal rewarder on Gauge B
    const personalRewarderBfrodo = await logBlock("init personal rewarder B for frodo", () =>
      initPersonalRewarderCp({ client, poolGauge: poolGaugeB, owner: frodo }),
    )

    // Frodo's personal rewarder is synced to the pool gauge
    expect(personalRewarderBfrodo.lastSeenTotalEmittedRay.toString()).to.equal("120")
    // Frodo has not earned any time units yet
    expect(personalRewarderBfrodo.lastSeenTimeUnits).to.equal("0")
    expect(parseInt(personalRewarderBfrodo.lastUpdatedTs.toString())).to.be.closeTo(now, 10)

    // Frodo deposits 1 LP token to his CP LP Escrow
    await logBlock("deposit 1 LP token to frodo's CP LP Escrow", () =>
      depositLpTokens({
        client,
        signer: frodo,
        personalPosition: lpPersonalPositionBFrodo,
        lpSrc: lpAtaBFrodo,
        amount: 1n,
      }),
    )

    // no time has passed yet
    // frodo tries to accrue ray, but gets none
    await logBlock("accrue ray for frodo on gauge B", () =>
      accrueRay({ client, personalRewarder: personalRewarderBfrodo }),
    )
    await personalRewarderBfrodo.reload(client.getConnection())
    expect(personalRewarderBfrodo.stagedRay.toString()).to.equal("0")

    // advance clock 1 day
    await client.advanceClock(24 * 60 * 60)
    await client.advanceSlot()
    now += 24 * 60 * 60

    // Frodo should get all 120 new RAY that go to Gauge B
    // Bilbo should get another 240 RAY
    await logBlock("accrue ray for bilbo on gauge A", () =>
      accrueRay({ client, personalRewarder: personalRewarderABilbo }),
    )
    await logBlock("accrue ray for frodo on gauge B", () =>
      accrueRay({ client, personalRewarder: personalRewarderBfrodo }),
    )
    await personalRewarderABilbo.reload(client.getConnection())
    await personalRewarderBfrodo.reload(client.getConnection())

    expect(personalRewarderBfrodo.stagedRay.toString()).to.equal("119")
    expect(personalRewarderABilbo.stagedRay.toString()).to.equal("837")

    // now, for the grand finale, bilbo deposits 2 LP tokens for Pool B
    // this will split up how much RAY Bilbo & Frodo get from Gauge B
    await logBlock("deposit 2 LP tokens to bilbo's CP LP Escrow for Pool B", () =>
      depositLpTokens({
        client,
        signer: bilbo,
        personalPosition: lpPersonalPositionBBilbo,
        lpSrc: lpAtaBBilbo,
        amount: 2n,
      }),
    )

    // Bilbo has 2 in B
    // Frodo has 1 in B
    await lpPersonalPositionBBilbo.reload(client.getConnection())
    await lpPersonalPositionBFrodo.reload(client.getConnection())
    expect(lpPersonalPositionBBilbo.balance.toString()).to.equal("2")
    expect(lpPersonalPositionBFrodo.balance.toString()).to.equal("1")

    // Bilbo needs a personal rewarder for Pool B
    const personalRewarderBBilbo = await logBlock("init personal rewarder B for bilbo", () =>
      initPersonalRewarderCp({ client, poolGauge: poolGaugeB, owner: bilbo }),
    )

    // advance clock 1 day
    await client.advanceClock(24 * 60 * 60)
    await client.advanceSlot()
    now += 24 * 60 * 60

    // Gauge B emits 120 RAY
    // Bilbo gets 2/3 = 80
    // Frodo gets 1/3 = 40
    await logBlock("accrue ray for bilbo on gauge B", () =>
      accrueRay({ client, personalRewarder: personalRewarderBBilbo }),
    )
    await logBlock("accrue ray for frodo on gauge B", () =>
      accrueRay({ client, personalRewarder: personalRewarderBfrodo }),
    )
    await personalRewarderBBilbo.reload(client.getConnection())
    await personalRewarderBfrodo.reload(client.getConnection())

    expect(personalRewarderBBilbo.stagedRay.toString()).to.equal("79")
    expect(personalRewarderBfrodo.stagedRay.toString()).to.equal((39 + 119).toString())
  })
})

async function accrueRay({
  client,
  personalRewarder,
}: {
  client: BankrunClient
  personalRewarder: PersonalRewarderCpSdk
}) {
  const ix = personalRewarder.accrueRayIx()
  await signSendConfirm(client, [ix])
}

async function initPersonalRewarderCp({
  client,
  poolGauge,
  owner,
}: {
  client: BankrunClient
  poolGauge: PoolGauge
  owner: web3.Keypair
}) {
  const ix = poolGauge.initPersonalRewarderCpIx({ owner: owner.publicKey })
  await signSendConfirm(client, [ix], owner)

  const personalRewarder = await PersonalRewarderCpSdk.load({
    connection: client.getConnection(),
    poolId: poolGauge.poolId,
    owner: owner.publicKey,
  })

  return personalRewarder
}

async function initPersonalRewarderCl({
  client,
  poolGauge,
  nftMint,
  owner,
}: {
  client: BankrunClient
  poolGauge: PoolGauge
  nftMint: web3.PublicKey
  owner: web3.Keypair
}) {
  const rayClPda = new RayClPda()
  const personalLiqPosition = rayClPda.personalPosition({ nftMint })
  const personalPositionAccount = await accounts.PersonalPositionState.fetch(
    client.getConnection(),
    personalLiqPosition,
  )
  const tickLo = personalPositionAccount.tickLowerIndex
  const tickHi = personalPositionAccount.tickUpperIndex
  const ix = poolGauge.initPersonalRewarderClIx({
    payer: owner.publicKey,
    personalLiqPosition,
    positionTickLo: tickLo,
    positionTickHi: tickHi,
  })
  await signSendConfirm(client, [ix], owner)

  const personalRewarder = await PersonalRewarderClSdk.load({
    connection: client.getConnection(),
    poolId: poolGauge.poolId,
    owner: owner.publicKey,
    personalPosition: personalLiqPosition,
    tickLowerIndex: tickLo,
    tickUpperIndex: tickHi,
  })

  return personalRewarder
}

async function syncPoolIndex({ client, poolGauge }: { client: BankrunClient; poolGauge: PoolGauge }) {
  const ix = poolGauge.syncIx()
  await signSendConfirm(client, [ix])
}

async function changeVotesOnPersonalGauge({
  client,
  personalGauge,
  owner,
  amount,
}: {
  client: BankrunClient
  personalGauge: PersonalGauge
  owner: web3.Keypair
  amount: bigint
}) {
  const ix = personalGauge.changeVotesIx(amount)
  return signSendConfirm(client, [ix], owner)
}

async function initPersonalGauge({
  client,
  poolId,
  poolGauge,
  owner,
}: {
  client: BankrunClient
  poolId: web3.PublicKey
  poolGauge: PoolGauge
  owner: web3.Keypair
}) {
  const ix = poolGauge.initPersonalGaugeIx({ owner: owner.publicKey, feePayer: owner.publicKey })
  await signSendConfirm(client, [ix], owner)

  const personalGauge = await PersonalGauge.load({
    connection: client.getConnection(),
    poolId,
    owner: owner.publicKey,
  })

  return personalGauge
}

async function transferLpTokensToUser({
  client,
  user,
  lpMint,
  cpSwapAdmin,
  amount,
}: {
  client: BankrunClient
  user: web3.Keypair
  lpMint: web3.PublicKey
  cpSwapAdmin: web3.Keypair
  amount: bigint
}) {
  const adminLpAta = getAssociatedTokenAddressSync(lpMint, cpSwapAdmin.publicKey, true)
  const dst = await logBlock("create user ATA", () =>
    createATA({
      client,
      owner: user.publicKey,
      mint: lpMint,
      tokenProgram: TOKEN_PROGRAM_ID,
    }),
  )

  await logBlock("transfer coins", () =>
    transferCoins({
      client,
      owner: cpSwapAdmin,
      src: adminLpAta,
      dst,
      amt: parseInt(amount.toString()),
    }),
  )
  return dst
}

async function initGlobalGaugeConfig({
  client,
  payer,
  rayMint,
  rayPerDay,
}: {
  client: BankrunClient
  payer: web3.Keypair
  rayMint: web3.PublicKey
  rayPerDay: bigint
}) {
  const ix = initGaugeConfigIx({
    rayPerDay,
    payer: payer.publicKey,
    rayMint,
  })
  await signSendConfirm(client, [ix], payer)

  const gaugeConfig = await GaugeConfig.load({
    connection: client.getConnection(),
  })

  return gaugeConfig
}

async function initPoolGauge({
  client,
  payer,
  poolId,
  gaugeConfig,
}: {
  client: BankrunClient
  payer: web3.Keypair
  poolId: web3.PublicKey
  gaugeConfig: GaugeConfig
}) {
  const ix = gaugeConfig.initPoolGaugeIx({ poolId, payer: payer.publicKey })
  await signSendConfirm(client, [ix], payer)

  const poolGauge = await PoolGauge.load({
    connection: client.getConnection(),
    poolId,
  })

  return poolGauge
}
