import { web3 } from "@coral-xyz/anchor"
import { BankrunClient, createMint, getOrderedTokenMints, signSendConfirm } from "./util"
import { TOKEN_PROGRAM_ID } from "@solana/spl-token"
import { RayClIx } from "@raygauge/ray-cl-ix"
import { accounts, instructions } from "@raygauge/ray-cl-idl"
import { SqrtPriceMath } from "@raydium-io/raydium-sdk-v2"
import Decimal from "decimal.js"

export const CL_SWAP_PROGRAM_ID = new web3.PublicKey("CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK")

// export const clSwapProgram = new Program<AmmV3>(IDL as AmmV3, CL_SWAP_PROGRAM_ID)

function pdaAmmConfig(index: number) {
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from("amm_config"), numberToU16BufferBigEndian(index)],
    CL_SWAP_PROGRAM_ID,
  )[0]
}

function numberToU16BufferBigEndian(num: number) {
  // Create an ArrayBuffer of 2 bytes
  let buffer = new ArrayBuffer(2)

  // Create a DataView for the buffer
  let view = new DataView(buffer)

  // Set the number as a u16 value in big-endian order
  view.setUint16(0, num, false) // false for big-endian

  return new Uint8Array(buffer)
}

export function createAmmConfigIx(index: number, owner: web3.PublicKey) {
  const ammConfig = pdaAmmConfig(index)
  // create an AMM config with a tick spacing of 8 and no fees
  return instructions.createAmmConfig(
    { index, tickSpacing: 8, tradeFeeRate: 0, protocolFeeRate: 0, fundFeeRate: 0 },
    {
      owner,
      ammConfig,
      systemProgram: web3.SystemProgram.programId,
    },
  )
}

export async function getPoolState(client: BankrunClient, pool: web3.PublicKey) {
  const account = await accounts.PoolState.fetch(client.getConnection(), pool)

  const poolInfo = {}
  return {
    price: SqrtPriceMath.sqrtPriceX64ToPrice(account.sqrtPriceX64, 6, 6),
    tickCurrent: account.tickCurrent,
    liquidity: account.liquidity,
    account,
  }
}

export async function createPool(
  client: BankrunClient,
  admin: web3.Keypair,
  ammConfigIndex: number,
  initPrice: number = 1,
) {
  const rayClIx = new RayClIx()
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

  const initialPriceX64 = SqrtPriceMath.priceToSqrtPriceX64(new Decimal(initPrice), 6, 6)
  const createPoolIx = rayClIx.createPool({
    payer: admin.publicKey,
    ammConfigIndex,
    mint0: token0.publicKey,
    mint1: token1.publicKey,
    sqrtPriceX64: initialPriceX64,
  })

  await signSendConfirm(client, [createPoolIx], admin)
  const poolState = rayClIx.pda.pool({ index: ammConfigIndex, mint0: token0.publicKey, mint1: token1.publicKey })
  return { token0, token1, poolState }
}
