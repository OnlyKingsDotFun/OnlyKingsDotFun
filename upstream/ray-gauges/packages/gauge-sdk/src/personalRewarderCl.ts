import { web3 } from "@coral-xyz/anchor"
import { accounts, instructions, PROGRAM_ID } from "@raygauge/gauge-gen"
import { GaugePDA } from "@raygauge/gauge-pda"
import { PreciseNumber } from "@raygauge/number"
import { CL_SWAP_PROGRAM_ID } from "@raygauge/ray-cl-idl"
import { RayClPda } from "@raygauge/ray-cl-pda"

type PersonalRewarderClData = {
  /** The gauge program id */
  programId: web3.PublicKey
  /** The address of the pool (CP or CL) */
  poolId: web3.PublicKey
  clmmProgramId: web3.PublicKey
  tickLowerIndex: number
  tickUpperIndex: number
  state: {
    account: accounts.PersonalRewarderCl
  }
}

export interface PersonalRewarderClLoadArgs {
  connection: web3.Connection

  /** The address of the clmm pool */
  poolId: web3.PublicKey

  owner: web3.PublicKey

  /** The address of the personal position (tied to the NFT mint) */
  personalPosition: web3.PublicKey

  /** The address of the CLMM program */
  clmmProgramId?: web3.PublicKey

  /** The program ID for the Gauge program */
  programId?: web3.PublicKey

  tickLowerIndex: number
  tickUpperIndex: number
}

/** Personal rewarder for Concentrated liquidity pools */
export class PersonalRewarderClSdk {
  constructor(private data: PersonalRewarderClData) {}

  static async load({
    connection,
    poolId,
    programId,
    personalPosition,
    clmmProgramId,
    tickLowerIndex,
    tickUpperIndex,
  }: PersonalRewarderClLoadArgs) {
    programId = programId ?? PROGRAM_ID
    clmmProgramId = clmmProgramId ?? CL_SWAP_PROGRAM_ID
    const pda = new GaugePDA(programId)

    const address = pda.personalRewarderCl({ personalLiqPosition: personalPosition })
    const state = await loadState(connection, address)

    return new PersonalRewarderClSdk({ programId, poolId, clmmProgramId, tickLowerIndex, tickUpperIndex, state })
  }

  get clmmProgramId() {
    return this.data.clmmProgramId
  }

  get account() {
    return this.data.state.account
  }

  get tickLowerIndex() {
    return this.data.tickLowerIndex
  }

  get tickUpperIndex() {
    return this.data.tickUpperIndex
  }

  get poolGaugeAddress() {
    return this.account.poolGauge
  }

  /** The address of the personal position with the CLMM (tied to the NFT mint) */
  get personalPosition() {
    return this.account.poolPosition
  }

  /** The address of the pool (CP or CL) */
  get poolId() {
    return this.data.poolId
  }

  get protocolPosition() {
    const rayClPda = new RayClPda(this.clmmProgramId)
    return rayClPda.protocolPosition({ pool: this.poolId, tickLo: this.tickLowerIndex, tickHi: this.tickUpperIndex })
  }

  get tickArrayLowerAccount() {
    const rayClPda = new RayClPda(this.clmmProgramId)
    return rayClPda.tickArrayAccount({ pool: this.poolId, index: this.tickLowerIndex })
  }

  get tickArrayUpperAccount() {
    const rayClPda = new RayClPda(this.clmmProgramId)
    return rayClPda.tickArrayAccount({ pool: this.poolId, index: this.tickUpperIndex })
  }

  get gaugeConfigAddress() {
    const gaugePda = new GaugePDA(this.data.programId)
    return gaugePda.globalConfig()
  }

  get address() {
    const pda = new GaugePDA(this.data.programId)
    return pda.personalRewarderCl({ personalLiqPosition: this.personalPosition })
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
  accrueRayIx({ payer }) {
    return instructions.clAccrueRay({
      poolGauge: this.poolGaugeAddress,
      personalRewarder: this.address,
      poolPosition: this.personalPosition,
      poolState: this.poolId,
      protocolPosition: this.protocolPosition,
      payer,
      gaugeConfig: this.gaugeConfigAddress,
      clmmProgram: this.clmmProgramId,
      tickArrayLowerLoader: this.tickArrayLowerAccount,
      tickArrayUpperLoader: this.tickArrayUpperAccount,
    })
  }
}

async function loadState(connection: web3.Connection, address: web3.PublicKey) {
  const account = await accounts.PersonalRewarderCl.fetch(connection, address)
  return { account }
}
