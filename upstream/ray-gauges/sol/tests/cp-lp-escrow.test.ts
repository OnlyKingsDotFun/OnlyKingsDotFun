import { CpLpEscrow, CpLpEscrowPersonalPosition, initTimeTrackerIx } from "@raygauge/cp-lp-escrow-sdk"
import {
  BankrunClient,
  bankrunPrelude,
  getTokenBalance,
  initUser,
  loadLocalKey,
  logBlock,
  signSendConfirm,
} from "./util"
import { BankrunProvider } from "anchor-bankrun"
import { web3 } from "@coral-xyz/anchor"
import { initPool } from "./cp-swap.test"
import { assert, AssertionError, expect } from "chai"

async function prelude() {
  const { client, provider, context } = await bankrunPrelude()
  const admin = await loadLocalKey("tests/fixtures/cp_admin.json", client)

  return { admin, client, provider, context }
}

describe("cp lp escrow 2", () => {
  it("inits an escrow", async () => {
    const { admin, client, provider } = await prelude()
    // init the CP-Swap pool
    const poolRet = await initPool({ admin, client, provider })

    // init the escrow
    const escrowSdk = await initLpEscrow({ client, poolId: poolRet.pool })

    // check that the escrow was initialized with the current timestamp
    expect(parseInt(escrowSdk.lastSeenTs.toString())).to.be.closeTo(Date.now() / 1000, 2)

    // check that the index is 0
    expect(escrowSdk.index).to.equal("0")

    // check that the poolId is correct
    expect(escrowSdk.poolId.equals(poolRet.pool)).to.be.true

    // check that the total LP deposited is 0
    expect(escrowSdk.totalLpDeposited.toString()).to.equal("0")
  })

  it("inits a personal position", async () => {
    const { admin, client, provider } = await prelude()

    const { escrowSdk } = await setupPoolAndEscrow({ admin, client, provider })

    const bilbo = await initUser(client)
    const personalPosition = await initPersonalPosition({ client, escrowSdk, owner: bilbo })

    expect(personalPosition.owner.equals(bilbo.publicKey)).to.be.true
    expect(personalPosition.poolId.equals(escrowSdk.poolId)).to.be.true
    expect(personalPosition.timeTracker.equals(escrowSdk.selfAddress)).to.be.true

    const frodo = await initUser(client)
    const personalPosition2 = await initPersonalPosition({ client, escrowSdk, owner: frodo })

    expect(personalPosition2.owner.equals(frodo.publicKey)).to.be.true
    expect(personalPosition2.poolId.equals(escrowSdk.poolId)).to.be.true
    expect(personalPosition2.timeTracker.equals(escrowSdk.selfAddress)).to.be.true
  })

  it("deposits LP tokens", async () => {
    const { admin, client, provider } = await prelude()
    const { pool, escrowSdk } = await setupPoolAndEscrow({ admin, client, provider })
    const adminPersonalPosition = await initPersonalPosition({ client, escrowSdk, owner: admin })

    const lpBal0 = await getTokenBalance(client, pool.lpAta)

    expect(lpBal0 > 0n)

    await depositLpTokens({
      signer: admin,
      client,
      personalPosition: adminPersonalPosition,
      amount: lpBal0 / 4n,
      lpSrc: pool.lpAta,
    })

    await adminPersonalPosition.reload(client.getConnection())

    // check that tokens were deposited
    expect(adminPersonalPosition.balance.toString()).to.equal((lpBal0 / 4n).toString())
    // check that tokens left in the source account
    const lpBal1 = await getTokenBalance(client, pool.lpAta)
    expect(lpBal1).to.equal(lpBal0 - lpBal0 / 4n)

    await escrowSdk.reload(client.getConnection())

    // check that the total LP deposited is correct
    expect(escrowSdk.totalLpDeposited.toString()).to.equal((lpBal0 / 4n).toString())
  })

  it("deposits and withdraws LP tokens", async () => {
    const { admin, client, provider } = await prelude()
    const { pool, escrowSdk } = await setupPoolAndEscrow({ admin, client, provider })
    const adminPersonalPosition = await initPersonalPosition({ client, escrowSdk, owner: admin })

    const lpBal0 = await getTokenBalance(client, pool.lpAta)

    expect(lpBal0 > 0n)

    const depositAmount = lpBal0 / 4n
    await depositLpTokens({
      signer: admin,
      client,
      personalPosition: adminPersonalPosition,
      amount: depositAmount,
      lpSrc: pool.lpAta,
    })

    await adminPersonalPosition.reload(client.getConnection())

    // check that tokens were deposited
    expect(adminPersonalPosition.balance.toString()).to.equal(depositAmount.toString())
    // check that tokens left in the source account
    const lpBal1 = await getTokenBalance(client, pool.lpAta)
    expect(lpBal1).to.equal(lpBal0 - depositAmount)

    await escrowSdk.reload(client.getConnection())

    // check that the total LP deposited is correct
    expect(escrowSdk.totalLpDeposited.toString()).to.equal(depositAmount.toString())

    const withdrawAmount = depositAmount / 2n

    await withdrawLpTokens({
      signer: admin,
      client,
      personalPosition: adminPersonalPosition,
      amount: withdrawAmount,
      lpDst: pool.lpAta,
    })

    await adminPersonalPosition.reload(client.getConnection())
    expect(adminPersonalPosition.balance.toString()).to.equal((depositAmount - withdrawAmount).toString())

    const lpBal2 = await getTokenBalance(client, pool.lpAta)
    expect(lpBal2).to.equal(lpBal1 + withdrawAmount)

    await escrowSdk.reload(client.getConnection())

    // check that the total LP deposited is correct
    expect(escrowSdk.totalLpDeposited.toString()).to.equal((depositAmount - withdrawAmount).toString())
  })

  it("cannot withdraw more than the balance", async () => {
    const { admin, client, provider } = await prelude()
    const { pool, escrowSdk } = await setupPoolAndEscrow({ admin, client, provider })
    const adminPersonalPosition = await initPersonalPosition({ client, escrowSdk, owner: admin })

    try {
      await withdrawLpTokens({
        signer: admin,
        client,
        personalPosition: adminPersonalPosition,
        amount: adminPersonalPosition.balance + 1n,
        lpDst: pool.lpAta,
      })
      assert.fail("should have thrown")
    } catch (e) {
      if (e instanceof AssertionError) {
        throw e
      }
      // expected
    }
  })

  it("accrues time units", async () => {
    const { admin, client, provider } = await prelude()
    const { pool, escrowSdk } = await setupPoolAndEscrow({ admin, client, provider })
    const adminPersonalPosition = await initPersonalPosition({ client, escrowSdk, owner: admin })

    const lpBal0 = await getTokenBalance(client, pool.lpAta)

    expect(lpBal0 > 0n)

    await depositLpTokens({
      signer: admin,
      client,
      personalPosition: adminPersonalPosition,
      amount: 10n,
      lpSrc: pool.lpAta,
    })

    await adminPersonalPosition.reload(client.getConnection())

    // the user has earned 0 time units
    expect(adminPersonalPosition.earnedTimeUnits).to.eq("0")

    // advance the clock 360 seconds
    await client.advanceClock(360)

    // deposit 20 lp tokens
    // this will cause a time-unit accrual
    // but the 20 tokens will not earn anything
    await depositLpTokens({
      signer: admin,
      client,
      personalPosition: adminPersonalPosition,
      amount: 20n,
      lpSrc: pool.lpAta,
    })

    await adminPersonalPosition.reload(client.getConnection())
    await escrowSdk.reload(client.getConnection())

    // this user had all the LP tokens for the pool, so they earn all 360 units
    expect(adminPersonalPosition.earnedTimeUnits).to.eq("360")
    // there are 10 LP tokens deposited, so there is 360/10 for the index
    expect(escrowSdk.index).to.eq("36")

    // advance the clock 360 seconds
    await client.advanceClock(360)

    // deposit 0 lp tokens
    // this will cause a time-unit accrual
    await depositLpTokens({
      signer: admin,
      client,
      personalPosition: adminPersonalPosition,
      amount: 0n,
      lpSrc: pool.lpAta,
    })

    await adminPersonalPosition.reload(client.getConnection())
    await escrowSdk.reload(client.getConnection())

    // this user had all the LP tokens for the pool, so they earn all 360 units
    expect(adminPersonalPosition.earnedTimeUnits).to.eq("720")
    // there was an index of 36
    // and then 30 tokens earned 360 units
    // 360 / 30 = 12
    // so the index is now 36 + 12 = 48
    expect(escrowSdk.index).to.eq("48")
  })

  it("does not accrue time units if no LP tokens are deposited", async () => {
    const { admin, client, provider } = await prelude()
    const { pool, escrowSdk } = await setupPoolAndEscrow({ admin, client, provider })
    const adminPersonalPosition = await initPersonalPosition({ client, escrowSdk, owner: admin })

    await depositLpTokens({
      signer: admin,
      client,
      personalPosition: adminPersonalPosition,
      amount: 0n,
      lpSrc: pool.lpAta,
    })

    await adminPersonalPosition.reload(client.getConnection())

    // the user has earned 0 time units
    expect(adminPersonalPosition.earnedTimeUnits).to.eq("0")

    // advance the clock 360 seconds
    await client.advanceClock(360)
    await client.advanceSlot()

    await depositLpTokens({
      signer: admin,
      client,
      personalPosition: adminPersonalPosition,
      amount: 0n,
      lpSrc: pool.lpAta,
    })

    await adminPersonalPosition.reload(client.getConnection())
    await escrowSdk.reload(client.getConnection())

    // this user had all the LP tokens for the pool, so they earn all 360 units
    expect(adminPersonalPosition.earnedTimeUnits).to.eq("0")
    // there are 10 LP tokens deposited, so there is 360/10 for the index
    expect(escrowSdk.index).to.eq("0")
    expect(parseInt(escrowSdk.lastSeenTs.toString())).to.be.closeTo(Date.now() / 1000 + 360, 2)
  })
})

export async function withdrawLpTokens({
  signer,
  client,
  personalPosition,
  amount,
  lpDst,
}: {
  signer: web3.Keypair
  client: BankrunClient
  personalPosition: CpLpEscrowPersonalPosition
  amount: bigint
  lpDst: web3.PublicKey
}) {
  const ix = personalPosition.withdrawIx({ amount, lpDst })
  await logBlock("withdraw LP tokens", () => signSendConfirm(client, [ix], client.getPayer(), [signer]))
}

export async function depositLpTokens({
  signer,
  client,
  personalPosition,
  amount,
  lpSrc,
}: {
  signer: web3.Keypair
  client: BankrunClient
  personalPosition: CpLpEscrowPersonalPosition
  amount: bigint
  lpSrc: web3.PublicKey
}) {
  const ix = personalPosition.depositIx({ amount, lpSrc })
  await logBlock("deposit LP tokens", () => signSendConfirm(client, [ix], client.getPayer(), [signer]))
}

export async function initPersonalPosition({
  client,
  escrowSdk,
  owner,
}: {
  client: BankrunClient
  escrowSdk: CpLpEscrow
  owner: web3.Keypair
}) {
  const ix = escrowSdk.initPersonalPositionIx({ owner: owner.publicKey })
  await logBlock("init personal position", () => signSendConfirm(client, [ix], owner))

  const personalPosition = await CpLpEscrowPersonalPosition.load({
    connection: client.getConnection(),
    poolId: escrowSdk.poolId,
    owner: owner.publicKey,
  })

  return personalPosition
}

export async function syncPersonalPosition({
  client,
  personalPosition,
}: {
  client: BankrunClient
  personalPosition: CpLpEscrowPersonalPosition
}) {
  const ix = personalPosition.syncIx()
  await logBlock("sync personal position", () => signSendConfirm(client, [ix]))
}

export async function initLpEscrow({ client, poolId }: { client: BankrunClient; poolId: web3.PublicKey }) {
  const ix = initTimeTrackerIx({
    payer: client.getPayer().publicKey,
    poolId,
  })

  await logBlock("init time tracker", () => signSendConfirm(client, [ix]))

  const escrowSdk = await CpLpEscrow.load({ connection: client.getConnection(), poolId })
  return escrowSdk
}

async function setupPoolAndEscrow({
  admin,
  client,
  provider,
}: {
  admin: web3.Keypair
  client: BankrunClient
  provider: BankrunProvider
}) {
  const pool = await initPool({ admin, client, provider })
  const escrowSdk = await initLpEscrow({ client, poolId: pool.pool })
  return { pool, escrowSdk }
}
