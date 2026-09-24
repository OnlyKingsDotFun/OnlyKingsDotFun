import { BN, Program, Provider, utils, web3 } from "@coral-xyz/anchor"
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token"
import { RayCpPda } from "@raygauge/ray-cp-pda"
import { IDL, RaydiumCpSwap } from "@raygauge/ray-cp-idl"

export const CP_SWAP_PROGRAM_ID = new web3.PublicKey("CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C")

export const CP_SWAP_ADMIN_ID = new web3.PublicKey("33UrW4Ly4Q242osMjaCEVuMjWx24hZguGnCV6dkq1DUz")

export const CP_SWAP_POOL_FEE_ACCOUNT = getAssociatedTokenAddressSync(NATIVE_MINT, CP_SWAP_ADMIN_ID)

export function makeCPProgram(provider: Provider) {
  return new Program(IDL, CP_SWAP_PROGRAM_ID, provider)
}

const pda = new RayCpPda()
const authority = pda.auth

export async function initPoolIx(
  program: Program<RaydiumCpSwap>,
  creator: web3.PublicKey,
  configAddress: web3.PublicKey,
  token0: web3.PublicKey,
  token1: web3.PublicKey,
  amount0: BN,
  amount1: BN,
) {
  const poolAddress = pda.pool({ index: 0, mint0: token0, mint1: token1 })
  const lpMintAddress = pda.poolLpMint({ pool: poolAddress })
  const observationAddress = pda.poolObservation({ pool: poolAddress })
  const vault0 = pda.poolValut({ pool: poolAddress, mint: token0 })
  const vault1 = pda.poolValut({ pool: poolAddress, mint: token1 })
  const [creatorLpTokenAddress] = web3.PublicKey.findProgramAddressSync(
    [creator.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), lpMintAddress.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )
  const creatorToken0 = getAssociatedTokenAddressSync(token0, creator, false)
  const creatorToken1 = getAssociatedTokenAddressSync(token1, creator, false)
  const ix = await program.methods
    .initialize(amount0, amount1, new BN(0))
    .accountsStrict({
      creator,
      ammConfig: configAddress,
      authority,
      poolState: poolAddress,
      token0Mint: token0,
      token1Mint: token1,
      lpMint: lpMintAddress,
      creatorToken0,
      creatorToken1,
      token0Vault: vault0,
      token1Vault: vault1,
      creatorLpToken: creatorLpTokenAddress,
      tokenProgram: TOKEN_PROGRAM_ID,
      token0Program: TOKEN_PROGRAM_ID,
      token1Program: TOKEN_PROGRAM_ID,
      systemProgram: web3.SystemProgram.programId,
      rent: web3.SYSVAR_RENT_PUBKEY,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      createPoolFee: CP_SWAP_POOL_FEE_ACCOUNT,
      observationState: observationAddress,
    })
    .instruction()

  return ix
}

export async function createAmmConfigIx(
  program: Program<RaydiumCpSwap>,
  owner: web3.PublicKey,
  config_index: number,
  tradeFeeRate: BN,
  protocolFeeRate: BN,
  fundFeeRate: BN,
  create_fee: BN,
) {
  const ammConfig = pda.ammConfig({ index: config_index })
  const ix = await program.methods
    .createAmmConfig(config_index, tradeFeeRate, protocolFeeRate, fundFeeRate, create_fee)
    .accounts({
      owner,
      ammConfig,
      systemProgram: web3.SystemProgram.programId,
    })
    .instruction()

  return ix
}

/** Add two tokens and receive LP tokens */
export async function addLiquidityIx({
  program,
  lpOut,
  token0InMax,
  token1InMax,
  pool,
  depositor,
  token0Src,
  token1Src,
  lpDst,
}: {
  program: Program<RaydiumCpSwap>
  lpOut: BN
  token0InMax: BN
  token1InMax: BN
  pool: web3.PublicKey
  depositor: web3.PublicKey
  token0Src?: web3.PublicKey
  token1Src?: web3.PublicKey
  lpDst?: web3.PublicKey
}): Promise<web3.TransactionInstruction> {
  const p = await program.account.poolState.fetch(pool)
  const mint0 = p.token0Mint
  const mint1 = p.token1Mint
  const mintLp = p.lpMint

  token0Src = token0Src || getAssociatedTokenAddressSync(mint0, depositor, true, p.token0Program)
  token1Src = token1Src || getAssociatedTokenAddressSync(mint1, depositor, true, p.token1Program)
  lpDst = lpDst || getAssociatedTokenAddressSync(mintLp, depositor, false, TOKEN_PROGRAM_ID)
  const token0Vault = pda.poolValut({ pool, mint: mint0 })
  const token1Vault = pda.poolValut({ pool, mint: mint1 })

  return program.methods
    .deposit(lpOut, token0InMax, token1InMax)
    .accountsStrict({
      owner: depositor,
      authority,
      poolState: pool,
      ownerLpToken: lpDst,
      token0Account: token0Src,
      token1Account: token1Src,
      token0Vault,
      token1Vault,
      tokenProgram: TOKEN_PROGRAM_ID,
      tokenProgram2022: TOKEN_2022_PROGRAM_ID,
      vault0Mint: mint0,
      vault1Mint: mint1,
      lpMint: mintLp,
    })
    .instruction()
}
