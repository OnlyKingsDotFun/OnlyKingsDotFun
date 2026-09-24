import { BN, web3 } from "@coral-xyz/anchor"
import { instructions, PROGRAM_ID } from "@raygauge/gauge-gen"
import { GaugePDA } from "@raygauge/gauge-pda"
import { TOKEN_PROGRAM_ID } from "@solana/spl-token"

export function initGaugeConfigIx({
  rayPerDay,
  payer,
  rayMint,
  programId,
}: {
  rayPerDay: bigint
  payer: web3.PublicKey
  rayMint: web3.PublicKey
  programId?: web3.PublicKey
}) {
  programId = programId ?? PROGRAM_ID
  const rayEmissionPerDay = new BN(rayPerDay.toString())
  const pda = new GaugePDA(programId)
  const gaugeConfig = pda.globalConfig()
  const rayHopper = pda.globalRayHopper()

  return instructions.initGlobalConfig(
    { rayEmissionPerDay },
    {
      payer,
      rayMint,
      gaugeConfig,
      rayHopper,
      systemProgram: web3.SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
    },
  )
}
