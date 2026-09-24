import { instructions, PROGRAM_ID } from "@raygauge/cp-lp-escrow-gen"
import { CpLpEscrowPDA } from "@raygauge/cp-lp-escrow-pda"
import { CP_SWAP_PROGRAM_ID } from "@raygauge/ray-cp-idl"
import { RayCpPda } from "@raygauge/ray-cp-pda"
import { TOKEN_PROGRAM_ID } from "@solana/spl-token"
import * as web3 from "@solana/web3.js"

/** Initialize an escrow account for a pool */
export function initTimeTrackerIx({
  payer,
  poolId,
  cpLpEscrowProgramId = PROGRAM_ID,
  cpSwapProgramId = CP_SWAP_PROGRAM_ID,
}: {
  payer: web3.PublicKey
  poolId: web3.PublicKey
  cpLpEscrowProgramId?: web3.PublicKey
  cpSwapProgramId?: web3.PublicKey
}) {
  const rayCpPda = new RayCpPda(cpSwapProgramId)
  const pda = new CpLpEscrowPDA(cpLpEscrowProgramId)
  const lpMint = rayCpPda.poolLpMint({ pool: poolId })
  const timeTracker = pda.timeTracker({ poolId })
  const poolState = poolId
  const escrow = pda.lpEscrow({ poolId })

  return instructions.initEscrow(
    {
      payer,
      poolState,
      lpMint,
      escrow,
      timeTracker,
      systemProgram: web3.SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
    },
    cpLpEscrowProgramId,
  )
}
