import {
  BankrunClient,
  bankrunPrelude,
  createATA,
  createMint,
  getTokenBalance,
  initAdmin,
  initUser,
  logBlock,
  mintTo,
  signSendConfirm,
} from "./util"
import { BN, web3 } from "@coral-xyz/anchor"
import { tenant, reactor, ReactorPda } from "@raygauge/reactor-sdk"
import { instructions } from "@raygauge/reactor-gen"
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token"
import { assert, AssertionError, expect } from "chai"
import { PublicKey } from "@solana/web3.js"

const SECONDS_DAY = 24 * 60 * 60

async function prelude() {
  const { client, provider, context } = await bankrunPrelude()
  const admin = await initAdmin(client)
  const bilbo = await initUser(client)
  const frodo = await initUser(client)
  const { ray, tenantSdk } = await initReactorConfig({
    client,
    admin,
  })

  return { admin, client, provider, context, tenantSdk, bilbo, frodo, ray }
}

describe("reactor", () => {
  it("inits reactor config", async () => {
    const { client } = await bankrunPrelude()
    const admin = await initAdmin(client)

    await initReactorConfig({
      client,
      admin,
    })
  })

  it("inits reactor", async () => {
    const { client } = await bankrunPrelude()
    const admin = await initAdmin(client)

    const { tenantSdk } = await initReactorConfig({
      client,
      admin,
    })

    const bilbo = await initUser(client)

    await initReactor({
      client,
      owner: bilbo,
      tenantSdk,
    })
  })

  it("deposits ray & accrues isoRAY", async () => {
    const { client, bilbo, ray, admin, tenantSdk } = await prelude()

    const reactorSdk = await logBlock("init reactor", () =>
      initReactor({
        client,
        owner: bilbo,
        tenantSdk,
      }),
    )

    const bilboRayATA = await logBlock("create ATA", () =>
      createATA({
        client,
        owner: bilbo.publicKey,
        mint: ray,
        tokenProgram: TOKEN_PROGRAM_ID,
      }),
    )

    const amountRayToBilbo = 10e9
    await logBlock("mint to ATA", () =>
      mintTo({
        client,
        mint: ray,
        dst: bilboRayATA,
        amount: amountRayToBilbo,
        authority: admin,
      }),
    )

    const depositAmount = 1e9
    await logBlock("deposit ray", () =>
      depositRay({
        client,
        reactorSdk,
        rayMint: ray,
        owner: bilbo,
        amount: depositAmount,
      }),
    )
    await reactorSdk.reload(client.getConnection())
    const isoRAY_0 = reactorSdk.isoRayBalance
    expect(Number(isoRAY_0)).to.eq(0)

    // Advance time by 1 day
    await client.advanceClock(SECONDS_DAY)

    // deposit 0 RAY in order to accrue isoRAY
    await logBlock("deposit 0 ray", () =>
      depositRay({
        client,
        reactorSdk,
        rayMint: ray,
        owner: bilbo,
        amount: 0,
      }),
    )

    await reactorSdk.reload(client.getConnection())
    const isoRAY_1 = reactorSdk.isoRayBalance
    // isoRAY APR is 50%, and it has been 1 day
    const expectedIsoRay1 = Math.floor((depositAmount * 0.5) / 365)
    expect(Number(isoRAY_1)).to.eq(expectedIsoRay1)
  })

  it("withdraws some ray", async () => {
    const { bilbo, tenantSdk, ray, admin, client } = await prelude()
    const reactorSdk = await logBlock("init reactor", () =>
      initReactor({
        client,
        owner: bilbo,
        tenantSdk,
      }),
    )

    const bilboRayATA = await logBlock("create ATA", () =>
      createATA({
        client,
        owner: bilbo.publicKey,
        mint: ray,
        tokenProgram: TOKEN_PROGRAM_ID,
      }),
    )

    const amountRayToBilbo = 10e9
    await logBlock("mint to ATA", () =>
      mintTo({
        client,
        mint: ray,
        dst: bilboRayATA,
        amount: amountRayToBilbo,
        authority: admin,
      }),
    )

    const depositAmount = 1e9
    await logBlock("deposit ray", () =>
      depositRay({
        client,
        reactorSdk,
        rayMint: ray,
        owner: bilbo,
        amount: depositAmount,
      }),
    )

    await logBlock("withdraw ray", () =>
      withdrawRay({
        amount: 0.7e9,
        rayMint: ray,
        reactorSdk,
        owner: bilbo,
        client,
      }),
    )

    await reactorSdk.reload(client.getConnection())
    expect(Number(reactorSdk.depositedRayBalance)).to.eq(0.3e9)
  })

  it("withdraws all ray", async () => {
    const { bilbo, tenantSdk, ray, admin, client } = await prelude()
    const reactorSdk = await logBlock("init reactor", () =>
      initReactor({
        client,
        owner: bilbo,
        tenantSdk,
      }),
    )

    const bilboRayATA = await logBlock("create ATA", () =>
      createATA({
        client,
        owner: bilbo.publicKey,
        mint: ray,
        tokenProgram: TOKEN_PROGRAM_ID,
      }),
    )

    const amountRayToBilbo = 10e9
    await mintTo({
      client,
      mint: ray,
      dst: bilboRayATA,
      amount: amountRayToBilbo,
      authority: admin,
    })
    const rayBal0 = await getTokenBalance(client, bilboRayATA)

    const depositAmount = 1e9
    await depositRay({
      client,
      reactorSdk,
      rayMint: ray,
      owner: bilbo,
      amount: depositAmount,
    })

    await withdrawRay({
      amount: 1e9,
      rayMint: ray,
      reactorSdk,
      owner: bilbo,
      client,
    })

    const rayBal1 = await getTokenBalance(client, bilboRayATA)

    await reactorSdk.reload(client.getConnection())
    expect(Number(reactorSdk.depositedRayBalance)).to.eq(0)

    // RAY balance should be equal
    expect(rayBal0).to.eq(rayBal1)
  })

  it("slashes isoRAY", async () => {
    const { bilbo, tenantSdk, ray, admin, client } = await prelude()
    const reactorSdk = await logBlock("init reactor", () =>
      initReactor({
        client,
        owner: bilbo,
        tenantSdk,
      }),
    )

    const bilboRayATA = await logBlock("create ATA", () =>
      createATA({
        client,
        owner: bilbo.publicKey,
        mint: ray,
        tokenProgram: TOKEN_PROGRAM_ID,
      }),
    )

    const amountRayToBilbo = 10e9
    await logBlock("mint to ATA", () =>
      mintTo({
        client,
        mint: ray,
        dst: bilboRayATA,
        amount: amountRayToBilbo,
        authority: admin,
      }),
    )

    const depositAmount = 1e9
    await logBlock("deposit 1e9 ray", () =>
      depositRay({
        client,
        reactorSdk,
        rayMint: ray,
        owner: bilbo,
        amount: depositAmount,
      }),
    )

    // Advance time by 1 day
    await client.advanceClock(SECONDS_DAY)

    // deposit 0 RAY in order to accrue isoRAY
    await logBlock("deposit 0 ray", () =>
      depositRay({
        client,
        reactorSdk,
        rayMint: ray,
        owner: bilbo,
        amount: 0,
      }),
    )

    // 50% APR for 1 day
    const expectedIsoRay0 = Math.floor((depositAmount * 0.5) / 365)
    await reactorSdk.reload(client.getConnection())
    const isoRAY_0 = reactorSdk.isoRayBalance
    expect(Number(isoRAY_0)).to.eq(expectedIsoRay0)

    // withdraw 1/4 of the deposited RAY
    await logBlock("withdraw ray", () =>
      withdrawRay({
        owner: bilbo,
        amount: depositAmount / 4,
        reactorSdk,
        rayMint: ray,
        client,
      }),
    )

    await reactorSdk.reload(client.getConnection())
    const isoRAY_1 = reactorSdk.isoRayBalance
    expect(Number(isoRAY_1)).to.eq(Math.floor(expectedIsoRay0 * 0.75))
  })

  it("locks votes with 0 amount", async () => {
    const { bilbo, tenantSdk, client } = await prelude()
    const reactorSdk = await logBlock("init reactor", () =>
      initReactor({
        client,
        owner: bilbo,
        tenantSdk,
      }),
    )

    const ix = reactorSdk.ixLockVotes({ amount: BigInt(0) })
    await logBlock("lock votes", () => signSendConfirm(client, [ix], bilbo))

    await reactorSdk.reload(client.getConnection())
    expect(Number(reactorSdk.lockedVotes)).to.eq(0)
  })

  it("cannot lock votes it does not have RAY for", async () => {
    const { bilbo, tenantSdk, client, ray, admin } = await prelude()
    const reactorSdk = await logBlock("init reactor", () =>
      initReactor({
        client,
        owner: bilbo,
        tenantSdk,
      }),
    )

    await mintRayToUser({ client, ray, user: bilbo, admin })

    await logBlock("deposit 1e9 ray", () =>
      depositRay({
        client,
        reactorSdk,
        rayMint: ray,
        owner: bilbo,
        amount: 1e9,
      }),
    )

    const ix = reactorSdk.ixLockVotes({ amount: BigInt(1e9 + 1) })
    try {
      await logBlock("lock votes", () => signSendConfirm(client, [ix], bilbo))
      assert(false, "should have thrown")
    } catch (e) {
      if (e instanceof AssertionError) {
        throw e
      }
      // expected
    }
  })

  it("locks votes", async () => {
    const { bilbo, tenantSdk, client, ray, admin } = await prelude()
    const reactorSdk = await logBlock("init reactor", () => initReactor({ client, owner: bilbo, tenantSdk }))
    await mintRayToUser({ client, ray, user: bilbo, admin })

    await logBlock("deposit 1e9 ray", () =>
      depositRay({
        client,
        reactorSdk,
        rayMint: ray,
        owner: bilbo,
        amount: 1e9,
      }),
    )

    const ix0 = reactorSdk.ixLockVotes({ amount: BigInt(5e8) })
    await logBlock("lock votes", () => signSendConfirm(client, [ix0], bilbo))

    await reactorSdk.reload(client.getConnection())
    expect(Number(reactorSdk.lockedVotes)).to.eq(5e8)

    await client.advanceSlot()

    const ix1 = reactorSdk.ixLockVotes({ amount: BigInt(5e8) })
    await logBlock("lock votes", () => signSendConfirm(client, [ix1], bilbo))

    await reactorSdk.reload(client.getConnection())
    expect(Number(reactorSdk.lockedVotes)).to.eq(1e9)
  })

  it("cannot withdraw RAY with locked votes", async () => {
    const { bilbo, tenantSdk, client, ray, admin } = await prelude()
    const reactorSdk = await logBlock("init reactor", () => initReactor({ client, owner: bilbo, tenantSdk }))
    await mintRayToUser({ client, ray, user: bilbo, admin })

    await logBlock("deposit 1e9 ray", () =>
      depositRay({
        client,
        reactorSdk,
        rayMint: ray,
        owner: bilbo,
        amount: 1e9,
      }),
    )

    const ix0 = reactorSdk.ixLockVotes({ amount: BigInt(5e8) })
    await logBlock("lock votes", () => signSendConfirm(client, [ix0], bilbo))

    await reactorSdk.reload(client.getConnection())
    expect(Number(reactorSdk.lockedVotes)).to.eq(5e8)

    await client.advanceSlot()

    const rayDst = getAssociatedTokenAddressSync(ray, bilbo.publicKey)
    // cannot withdraw 6e8, since 5e8 are locked and 1e9 deposited
    try {
      const ix1 = reactorSdk.ixWithdrawRay({ amount: BigInt(6e8), rayDst })
      await logBlock("withdraw ray", () => signSendConfirm(client, [ix1], bilbo))
      expect.fail("fail")
    } catch (e) {
      if (e instanceof AssertionError) {
        throw e
      }
      // expected
    }
  })

  it("cannot unlock votes it does not have, with RAY balance", async () => {
    const { bilbo, tenantSdk, client, ray, admin } = await prelude()
    const reactorSdk = await logBlock("init reactor", () => initReactor({ client, owner: bilbo, tenantSdk }))
    await mintRayToUser({ client, ray, user: bilbo, admin })

    await logBlock("deposit ray", () =>
      depositRay({
        client,
        reactorSdk,
        rayMint: ray,
        owner: bilbo,
        amount: 1e9,
      }),
    )

    const lockIx = reactorSdk.ixLockVotes({ amount: BigInt(100) })
    await logBlock("lock votes", () => signSendConfirm(client, [lockIx], bilbo))

    // try to unlock 101 votes, but only 100 are locked
    const ix = reactorSdk.ixUnlockVotes({ amount: BigInt(100 + 1) })
    try {
      await logBlock("unlock votes", () => signSendConfirm(client, [ix], bilbo))
      expect.fail("should have thrown")
    } catch (e) {
      if (e instanceof AssertionError) {
        throw e
      }
      // expected
    }
  })

  it("unlocks votes and withdraws RAY", async () => {
    const { bilbo, tenantSdk, client, ray, admin } = await prelude()
    const reactorSdk = await logBlock("init reactor", () => initReactor({ client, owner: bilbo, tenantSdk }))
    await mintRayToUser({ client, ray, user: bilbo, admin })

    await logBlock("deposit ray", () =>
      depositRay({
        client,
        reactorSdk,
        rayMint: ray,
        owner: bilbo,
        amount: 100,
      }),
    )

    const lockIx = reactorSdk.ixLockVotes({ amount: BigInt(100) })
    await logBlock("lock votes", () => signSendConfirm(client, [lockIx], bilbo))

    const unlockIx = reactorSdk.ixUnlockVotes({ amount: BigInt(60) })
    await logBlock("unlock votes", () => signSendConfirm(client, [unlockIx], bilbo))

    await logBlock("withdraw ray", () => withdrawRay({ reactorSdk, owner: bilbo, amount: 60, rayMint: ray, client }))

    await reactorSdk.reload(client.getConnection())
    expect(Number(reactorSdk.depositedRayBalance)).to.eq(40)
    expect(Number(reactorSdk.lockedVotes)).to.eq(40)
  })

  it("accrues ray rewards", async () => {
    const { bilbo, tenantSdk, client, ray, admin, frodo } = await prelude()
    const reactorSdkBilbo = await logBlock("init reactor", () => initReactor({ client, owner: bilbo, tenantSdk }))

    await mintRayToUser({ client, ray, user: bilbo, admin })
    await mintRayToUser({ client, ray, user: frodo, admin })

    await logBlock("deposit 10 ray", () =>
      depositRay({
        client,
        reactorSdk: reactorSdkBilbo,
        rayMint: ray,
        owner: bilbo,
        amount: 10,
      }),
    )

    await client.advanceClock(SECONDS_DAY)
    await client.advanceSlot()

    await logBlock("deposit 0 ray", () =>
      depositRay({
        client,
        reactorSdk: reactorSdkBilbo,
        rayMint: ray,
        owner: bilbo,
        amount: 0,
      }),
    )

    await reactorSdkBilbo.reload(client.getConnection())
    const rayRayRewards = reactorSdkBilbo.uncollectedRayRewards
    // ray daily rate is 100
    expect(Number(rayRayRewards)).to.eq(100)

    // now frodo creates a reactor
    const reactorSdkFrodo = await logBlock("init reactor for frodo", () =>
      initReactor({ client, owner: frodo, tenantSdk }),
    )

    // advance time by 1 day
    await client.advanceClock(SECONDS_DAY)
    await client.advanceSlot()

    // deposit 0 ray to accrue rewards
    await logBlock("deposit 0 ray", () =>
      depositRay({
        client,
        reactorSdk: reactorSdkBilbo,
        rayMint: ray,
        owner: bilbo,
        amount: 0,
      }),
    )

    await logBlock("deposit 0 ray", () =>
      depositRay({
        client,
        reactorSdk: reactorSdkFrodo,
        rayMint: ray,
        owner: frodo,
        amount: 0,
      }),
    )

    await reactorSdkBilbo.reload(client.getConnection())
    await reactorSdkFrodo.reload(client.getConnection())

    // bilbo should get 100 more ray because he is the only one depositing
    expect(Number(reactorSdkBilbo.uncollectedRayRewards)).to.eq(200)
    expect(Number(reactorSdkFrodo.uncollectedRayRewards)).to.eq(0)

    // frodo deposits 30 ray
    await logBlock("deposit 30 ray", () =>
      depositRay({
        client,
        reactorSdk: reactorSdkFrodo,
        rayMint: ray,
        owner: frodo,
        amount: 30,
      }),
    )

    // advance time by 1 day
    await client.advanceClock(SECONDS_DAY)
    await client.advanceSlot()

    // deposit 0 ray to accrue rewards
    await logBlock("deposit 0 ray", () =>
      depositRay({
        client,
        reactorSdk: reactorSdkBilbo,
        rayMint: ray,
        owner: bilbo,
        amount: 0,
      }),
    )

    await logBlock("deposit 0 ray", () =>
      depositRay({
        client,
        reactorSdk: reactorSdkFrodo,
        rayMint: ray,
        owner: frodo,
        amount: 0,
      }),
    )

    await reactorSdkFrodo.reload(client.getConnection())
    await reactorSdkBilbo.reload(client.getConnection())
    // Frodo gets 3/4 = 75
    // Bilbo gets 1/4 = 25
    expect(Number(reactorSdkBilbo.uncollectedRayRewards)).to.eq(225)
    expect(Number(reactorSdkFrodo.uncollectedRayRewards)).to.eq(75)
  })

  it("can lock more votes with isoRAY", async () => {
    const { bilbo, tenantSdk, client, ray, admin } = await prelude()
    const reactorSdk = await logBlock("init reactor", () => initReactor({ client, owner: bilbo, tenantSdk }))
    await mintRayToUser({ client, ray, user: bilbo, admin })

    const depositAmount = 1e9
    await logBlock("deposit ray", () =>
      depositRay({
        client,
        reactorSdk,
        rayMint: ray,
        owner: bilbo,
        amount: depositAmount,
      }),
    )
    await reactorSdk.reload(client.getConnection())
    const isoRAY_0 = reactorSdk.isoRayBalance
    expect(Number(isoRAY_0)).to.eq(0)

    // Advance time by 1 day
    await client.advanceClock(SECONDS_DAY)

    // deposit 0 RAY in order to accrue isoRAY
    await logBlock("deposit 0 ray", () =>
      depositRay({
        client,
        reactorSdk,
        rayMint: ray,
        owner: bilbo,
        amount: 0,
      }),
    )

    await reactorSdk.reload(client.getConnection())
    const isoRAY_1 = reactorSdk.isoRayBalance
    // isoRAY APR is 50%, and it has been 1 day
    const expectedIsoRay1 = Math.floor((depositAmount * 0.5) / 365)
    expect(Number(isoRAY_1)).to.eq(expectedIsoRay1)

    const totalRayPower = depositAmount + expectedIsoRay1
    const lockIx = reactorSdk.ixLockVotes({ amount: BigInt(totalRayPower) })
    // succeeds
    await logBlock("lock votes", () => signSendConfirm(client, [lockIx], bilbo))

    await reactorSdk.reload(client.getConnection())
    expect(Number(reactorSdk.lockedVotes)).to.eq(totalRayPower)
  })

  it("can slash isoRAY with locked votes", async () => {
    // This test is a little tricky.
    // Bilbo deposits 1e9 RAY and earns 0.5e9 isoRAY after 1 year
    // He locks 1e9 votes
    // he withdraws 0.1e9 RAY, which is a 10% slash of his isoRAY
    // so, he now has 0.9e9 RAY and 0.45e9 isoRAY, which is still greater than 1e9 locked votes
    const { bilbo, tenantSdk, client, ray, admin } = await prelude()
    const reactorSdk = await logBlock("init reactor", () => initReactor({ client, owner: bilbo, tenantSdk }))

    await mintRayToUser({ client, ray, user: bilbo, admin })

    const depositAmount = 1e9
    await logBlock("deposit ray", () =>
      depositRay({
        client,
        reactorSdk,
        rayMint: ray,
        owner: bilbo,
        amount: depositAmount,
      }),
    )

    await client.advanceClock(SECONDS_DAY * 365)

    await logBlock("deposit 0 ray", () =>
      depositRay({
        client,
        reactorSdk,
        rayMint: ray,
        owner: bilbo,
        amount: 0,
      }),
    )

    await reactorSdk.reload(client.getConnection())
    const isoRAY_1 = reactorSdk.isoRayBalance
    expect(Number(isoRAY_1)).to.eq(0.5e9)

    // now withdraw 0.1e9 RAY
    await logBlock("withdraw ray", () => withdrawRay({ reactorSdk, owner: bilbo, amount: 0.1e9, rayMint: ray, client }))

    await reactorSdk.reload(client.getConnection())
    expect(Number(reactorSdk.depositedRayBalance)).to.eq(0.9e9)

    const isoRAY_2 = reactorSdk.isoRayBalance
    expect(Number(isoRAY_2)).to.eq(0.45e9)
  })
})

it("can slash isoRAY with locked votes, all the way", async () => {
  // This test is a little tricky.
  // Bilbo deposits 100 RAY and earns 50 isoRAY after 1 year
  // He locks 100 votes
  // How much RAY can he withdraw, slashing his isoRAY by withdrawing?

  // Let B = isoRAY boost = 50
  // Let D = RAY deposited = 100
  // Let L = locked votes = 100
  // When withdrawing W RAY, the slash to B is W * (B / D)
  // The new B' is B - W * (B / D)
  // The new D' is D - W

  // We want to find the W such that D' + B' = L
  // or, (D - W) + (B - W * (B / D)) = L
  // or, D + B - W - W * (B / D) = L
  // or, D + B - L = W + W * (B / D)
  // or, (D + B - L) / (1 + B / D) = W
  // W = D(B + D - L) / (D + B)

  const { bilbo, tenantSdk, client, ray, admin } = await prelude()
  const reactorSdk = await logBlock("init reactor", () => initReactor({ client, owner: bilbo, tenantSdk }))

  await mintRayToUser({ client, ray, user: bilbo, admin })

  const depositAmount = 100
  await logBlock("deposit ray", () =>
    depositRay({
      client,
      reactorSdk,
      rayMint: ray,
      owner: bilbo,
      amount: depositAmount,
    }),
  )

  await client.advanceClock(SECONDS_DAY * 365)

  await logBlock("deposit 0 ray", () =>
    depositRay({
      client,
      reactorSdk,
      rayMint: ray,
      owner: bilbo,
      amount: 0,
    }),
  )

  await reactorSdk.reload(client.getConnection())
  const isoRAY_1 = reactorSdk.isoRayBalance
  expect(Number(isoRAY_1)).to.eq(50)

  const lockIx = reactorSdk.ixLockVotes({ amount: BigInt(100) })
  await logBlock("lock votes", () => signSendConfirm(client, [lockIx], bilbo))

  // L = 100
  // B = 50
  // D = 100
  // W = D(B + D - L) / (D + B) = 100(50 + 100 - 100) / (100 + 50) = 100 * 50 / 150 = 33.33

  await logBlock("withdraw ray", () => withdrawRay({ reactorSdk, owner: bilbo, amount: 33, rayMint: ray, client }))

  await reactorSdk.reload(client.getConnection())
  expect(Number(reactorSdk.depositedRayBalance)).to.eq(67)
  expect(Number(reactorSdk.isoRayBalance)).to.eq(33)
  expect(Number(reactorSdk.lockedVotes)).to.eq(100)

  // now try withdrawing 1 more RAY - but you can't!
  // can't withdraw 1 RAY, since 67 is locked
  try {
    await logBlock("withdraw ray", () => withdrawRay({ reactorSdk, owner: bilbo, amount: 1, rayMint: ray, client }))
    expect.fail("should have thrown")
  } catch (e) {
    if (e instanceof AssertionError) {
      throw e
    }
    // expected
  }
})

export async function withdrawRay({
  reactorSdk,
  owner,
  amount,
  rayMint,
  client,
}: {
  reactorSdk: reactor.ReactorSdk
  owner: web3.Keypair
  amount: number
  rayMint: web3.PublicKey
  client: BankrunClient
}) {
  const rayDst = getAssociatedTokenAddressSync(rayMint, owner.publicKey)
  const ix = reactorSdk.ixWithdrawRay({ amount: BigInt(amount), rayDst })
  await signSendConfirm(client, [ix], owner)
}

export async function depositRay({
  client,
  reactorSdk,
  rayMint,
  owner,
  amount,
}: {
  client: BankrunClient
  reactorSdk: reactor.ReactorSdk
  rayMint: web3.PublicKey
  owner: web3.Keypair
  amount: number
}) {
  const raySrc = getAssociatedTokenAddressSync(rayMint, owner.publicKey)
  const depositIx = reactorSdk.ixDepositRay({ amount: BigInt(amount), raySrc })
  await signSendConfirm(client, [depositIx], owner)
}

export async function initReactor({
  client,
  owner,
  tenantSdk,
}: {
  client: BankrunClient
  owner: web3.Keypair
  tenantSdk: tenant.ReactorTenantSdk
}): Promise<reactor.ReactorSdk> {
  const ix = tenantSdk.initReactorIx({ payer: owner.publicKey, owner: owner.publicKey })
  await signSendConfirm(client, [ix], owner)
  return reactor.ReactorSdk.load({
    connection: client.getConnection(),
    owner: owner.publicKey,
  })
}

/** Create a Reactor Config with 50% APR on isoRAY and 100 daily RAY emitted */
export async function initReactorConfig({ client, admin }: { client: BankrunClient; admin: web3.Keypair }) {
  // account loaded in bankrun
  const rayMint = new PublicKey("4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R")

  const pda = new ReactorPda({})

  const ix = instructions.initConfig(
    { isoRayAprBps: 5000, rayRewardDailyEmission: new BN(100) },
    {
      rayMint: rayMint,
      rayVault: pda.rayVault(),
      payer: admin.publicKey,
      config: pda.tenant(),
      systemProgram: web3.SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      rayHopper: pda.rayHopper(),
    },
  )

  await signSendConfirm(client, [ix], admin)

  const tenantSdk = await tenant.ReactorTenantSdk.load({
    connection: client.getConnection(),
  })

  return { ray: rayMint, tenantSdk }
}

export async function mintRayToUser({
  client,
  ray,
  user,
  admin,
  amount = 10e9,
}: {
  client: BankrunClient
  ray: web3.PublicKey
  user: web3.Keypair
  admin: web3.Keypair
  amount?: number
}) {
  const userRayATA = await logBlock("create ATA", () =>
    createATA({
      client,
      owner: user.publicKey,
      mint: ray,
      tokenProgram: TOKEN_PROGRAM_ID,
    }),
  )

  await logBlock("mint to ATA", () =>
    mintTo({
      client,
      mint: ray,
      dst: userRayATA,
      amount,
      authority: admin,
    }),
  )
}
