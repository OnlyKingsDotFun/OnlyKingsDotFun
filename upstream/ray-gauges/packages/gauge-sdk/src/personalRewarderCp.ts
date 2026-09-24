import { web3 } from "@coral-xyz/anchor"
import { accounts, instructions, PROGRAM_ID } from "@raygauge/gauge-gen"
import { GaugePDA } from "@raygauge/gauge-pda"
import { PreciseNumber } from "@raygauge/number"
import { PROGRAM_ID as CP_LP_ESCROW_PROGRAM_ID } from "@raygauge/cp-lp-escrow-gen"
import { CpLpEscrowPDA } from "@raygauge/cp-lp-escrow-pda"

type PersonalRewarderCpData = {
  /** The gauge program id */
  programId: web3.PublicKey
  cpLpEscrowProgramId: web3.PublicKey
  /** The address of the pool (CP or CL) */
  poolId: web3.PublicKey
  state: {
    account: accounts.PersonalRewarderCp
  }
}

export interface PersonalRewarderCpLoadArgs {
  connection: web3.Connection
  /** The address of the pool (CP or CL) */
  poolId: web3.PublicKey
  owner: web3.PublicKey
  /** The program ID for the Gauge program */
  programId?: web3.PublicKey
  /** The program ID for the CP LP Escrow program */
  cpLpEscrowProgramId?: web3.PublicKey
}

/** Personal rewarder for CP pools */
export class PersonalRewarderCpSdk {
  constructor(private data: PersonalRewarderCpData) {}

  static async load({ connection, poolId, owner, programId, cpLpEscrowProgramId }: PersonalRewarderCpLoadArgs) {
    programId = programId ?? PROGRAM_ID
    cpLpEscrowProgramId = cpLpEscrowProgramId ?? CP_LP_ESCROW_PROGRAM_ID
    const pda = new GaugePDA(programId)

    const poolGaugeAddress = pda.poolGauge({ poolId })
    const address = pda.personalRewarderCp({ poolGauge: poolGaugeAddress, owner })
    const state = await loadState(connection, address)

    return new PersonalRewarderCpSdk({ programId, cpLpEscrowProgramId, poolId, state })
  }

  get account() {
    return this.data.state.account
  }

  get poolGaugeAddress() {
    return this.account.poolGauge
  }

  /** The address of the pool (CP or CL) */
  get poolId() {
    return this.data.poolId
  }

  get gaugeConfigAddress() {
    const gaugePda = new GaugePDA(this.data.programId)
    return gaugePda.globalConfig()
  }

  get owner() {
    return this.account.owner
  }

  get address() {
    const pda = new GaugePDA(this.data.programId)
    return pda.personalRewarderCp({ poolGauge: this.poolGaugeAddress, owner: this.owner })
  }

  get rewarderState() {
    return this.account.rewarder
  }

  get lastSeenTimeUnits(): string {
    return PreciseNumber.fromRaw(this.rewarderState.lastSeenTimeUnits.val).valueString
  }

  get lastSeenTotalEmittedRay(): bigint {
    return BigInt(this.rewarderState.lastSeenTotalEmittedRay.toString())
  }

  get lastUpdatedTs(): bigint {
    return BigInt(this.rewarderState.lastUpdatedTs.toString())
  }

  get stagedRay(): bigint {
    return BigInt(this.rewarderState.stagedRay.toString())
  }

  async reload(connection: web3.Connection) {
    const state = await loadState(connection, this.address)
    this.data.state = state
  }

  /** Accrue RAY for the personal rewarder  */
  accrueRayIx() {
    const cpLpEscrowPda = new CpLpEscrowPDA(this.data.cpLpEscrowProgramId)
    const liqPositionAddress = cpLpEscrowPda.personalPosition({ owner: this.owner, poolId: this.poolId })
    const timeTrackerAddress = cpLpEscrowPda.timeTracker({ poolId: this.poolId })

    return instructions.cpAccrueRay({
      poolGauge: this.poolGaugeAddress,
      personalRewarder: this.address,
      payer: this.owner,
      gaugeConfig: this.gaugeConfigAddress,
      liqPosition: liqPositionAddress,
      timeTracker: timeTrackerAddress,
      cpLpEscrowProgram: this.data.cpLpEscrowProgramId,
    })
  }
}

async function loadState(connection: web3.Connection, address: web3.PublicKey) {
  const account = await accounts.PersonalRewarderCp.fetch(connection, address)
  return { account }
}
