import { web3 } from "@coral-xyz/anchor"
import { PROGRAM_ID } from "@raygauge/cp-lp-escrow-gen"

export const LP_ESCROW_EED = "escrow"
export const PERSONAL_POSITION_SEED = "personal-position"
export const TIME_TRACKER = "time-tracker"

export class CpLpEscrowPDA {
  constructor(public programId = PROGRAM_ID) {}

  private findProgramAddressSync(seeds: Buffer[]) {
    return web3.PublicKey.findProgramAddressSync(seeds, this.programId)[0]
  }

  /** The time-tracker account */
  timeTracker({ poolId }: { poolId: web3.PublicKey }) {
    return this.findProgramAddressSync([Buffer.from(TIME_TRACKER), poolId.toBuffer()])
  }

  /** Escrow token account for deposited LP tokens */
  lpEscrow({ poolId }: { poolId: web3.PublicKey }) {
    return this.findProgramAddressSync([Buffer.from(LP_ESCROW_EED), poolId.toBuffer()])
  }

  /** User's personal position account */
  personalPosition({ owner, poolId }: { owner: web3.PublicKey; poolId: web3.PublicKey }) {
    const timeTracker = this.timeTracker({ poolId })
    return this.findProgramAddressSync([Buffer.from(PERSONAL_POSITION_SEED), timeTracker.toBuffer(), owner.toBuffer()])
  }
}
