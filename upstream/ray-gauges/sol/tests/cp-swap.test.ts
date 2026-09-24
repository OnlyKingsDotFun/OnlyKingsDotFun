import { BN, Program, web3 } from "@coral-xyz/anchor"
import {
  BankrunClient,
  bankrunPrelude,
  createATA,
  loadLocalKey,
  signSendConfirm,
  createMint,
  mintTo,
  accountExists,
  getOrderedTokenMints,
  logBlock,
  getTokenBalance,
} from "./util"
import * as cp from "./cp-util"
import { NATIVE_MINT, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token"
import { expect } from "chai"
import { RayCpPda } from "@raygauge/ray-cp-pda"
import { RaydiumCpSwap } from "@raygauge/ray-cp-idl"

const cpPda = new RayCpPda()

async function prelude() {
  const { client, provider } = await bankrunPrelude()
  const admin = await loadLocalKey("tests/fixtures/cp_admin.json", client)
  const cpProgram = cp.makeCPProgram(provider)

  return { admin, client, provider, cpProgram }
}

describe("cp swap program", () => {
  it("inits amm config", async () => {
    const { admin, client, cpProgram } = await prelude()
    await createAmmConfig(client, cpProgram, admin)
  })

  it("inits a pool", async () => {
    const { admin, client, provider } = await prelude()
    await initPool({ client, provider, admin })
  })

  it("deposits liquidity", async () => {
    const { admin, client, provider, cpProgram } = await prelude()

    const { lpAta, pool, token0, token1, token0Ata, token1Ata } = await logBlock("init pool", () =>
      initPool({
        client,
        provider,
        admin,
      }),
    )

    await logBlock("minting token 0", () =>
      mintTo({
        client,
        mint: token0.publicKey,
        dst: token0Ata,
        authority: admin,
        amount: 1e6,
      }),
    )

    await logBlock("minting token 1", () =>
      mintTo({
        client,
        mint: token1.publicKey,
        dst: token1Ata,
        authority: admin,
        amount: 1e6,
      }),
    )

    const ix = await cp.addLiquidityIx({
      program: cpProgram,
      depositor: admin.publicKey,
      pool,
      lpOut: new BN(1000),
      token0InMax: new BN(1e6),
      token1InMax: new BN(1e6),
    })
    const lpBefore = await getTokenBalance(client, lpAta)

    await logBlock("adding liqudiity", () => signSendConfirm(client, [ix], client.getPayer(), [admin]))
    const lpAfter = await getTokenBalance(client, lpAta)

    // LP tokens should be exact
    expect(lpAfter).to.equal(lpBefore + 1000n)
  })
})

export async function createAmmConfig(client: BankrunClient, program: Program<RaydiumCpSwap>, admin: web3.Keypair) {
  const ix = await cp.createAmmConfigIx(program, admin.publicKey, 0, new BN(10), new BN(10), new BN(10), new BN(0))
  await signSendConfirm(client, [ix], admin)
}

/** Initialize a CP-Swap pool */
export async function initPool({
  admin,
  client,
  provider,
}: {
  admin: web3.Keypair
  client: BankrunClient
  provider: any
}) {
  const cpProgram = cp.makeCPProgram(provider)

  const ammConfigAddress = cpPda.ammConfig({ index: 0 })
  const ammConfigInitialized = await accountExists({
    client,
    address: ammConfigAddress,
  })

  if (!ammConfigInitialized) {
    await createAmmConfig(client, cpProgram, admin)
  }

  const { token0, token1 } = getOrderedTokenMints()

  await createMint({
    mint: token0,
    client,
    payer: admin,
    authority: admin.publicKey,
    decimals: 6,
    tokenProgram: TOKEN_PROGRAM_ID,
  })

  await createMint({
    mint: token1,
    client,
    payer: admin,
    authority: admin.publicKey,
    decimals: 6,
    tokenProgram: TOKEN_PROGRAM_ID,
  })

  const token0Ata = await createATA({
    client,
    owner: admin.publicKey,
    mint: token0.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
  })

  const token1Ata = await createATA({
    client,
    owner: admin.publicKey,
    mint: token1.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
  })

  await mintTo({
    client,
    mint: token0.publicKey,
    dst: token0Ata,
    authority: admin,
    tokenProgram: TOKEN_PROGRAM_ID,
    amount: 10e6,
  })

  await mintTo({
    client,
    mint: token1.publicKey,
    dst: token1Ata,
    authority: admin,
    tokenProgram: TOKEN_PROGRAM_ID,
    amount: 10e6,
  })

  // create fee receiver
  await createATA({
    client,
    owner: admin.publicKey,
    mint: NATIVE_MINT,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  const ammConfig = cpPda.ammConfig({ index: 0 })
  const ix = await cp.initPoolIx(
    cpProgram,
    admin.publicKey,
    ammConfig,
    token0.publicKey,
    token1.publicKey,
    new BN(10e6),
    new BN(10e6),
  )

  await signSendConfirm(client, [ix], admin)
  const pool = cpPda.pool({ index: 0, mint0: token0.publicKey, mint1: token1.publicKey })
  const lpMint = cpPda.poolLpMint({ pool })
  const lpAta = getAssociatedTokenAddressSync(lpMint, admin.publicKey)

  return {
    token0,
    token1,
    admin,
    ammConfig,
    pool,
    lpMint,
    lpAta,
    token0Ata,
    token1Ata,
  }
}
