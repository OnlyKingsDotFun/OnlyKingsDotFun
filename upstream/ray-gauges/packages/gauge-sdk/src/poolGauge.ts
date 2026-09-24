import { web3 } from "@coral-xyz/anchor"
import { accounts, instructions, PROGRAM_ID } from "@raygauge/gauge-gen"
import { GaugePDA } from "@raygauge/gauge-pda"
import { PreciseNumber } from "@raygauge/number"
import { PROGRAM_ID as CP_LP_ESCROW_PROGRAM_ID } from "@raygauge/cp-lp-escrow-gen"
import { CpLpEscrowPDA } from "@raygauge/cp-lp-escrow-pda"
import { CL_SWAP_PROGRAM_ID } from "@raygauge/ray-cl-idl"
import { RayClPda } from "@raygauge/ray-cl-pda"
import { TickUtils } from "@raydium-io/raydium-sdk-v2"

type PoolGaugeData = {
  programId: web3.PublicKey
  cpLpEscrowProgramId: web3.PublicKey
  clmmProgramId: web3.PublicKey
  state: {
    account: accounts.Gauge
  }
}

export interface PoolGaugeLoadArgs {
  connection: web3.Connection
  poolId: web3.PublicKey
  programId?: web3.PublicKey
  cpLpEscrowProgramId?: web3.PublicKey
  clmmProgramId?: web3.PublicKey
}

export class PoolGauge {
  constructor(private data: PoolGaugeData) {}

  static async load(args: PoolGaugeLoadArgs) {
    const programId = args.programId ?? PROGRAM_ID
    const cpLpEscrowProgramId = args.cpLpEscrowProgramId ?? CP_LP_ESCROW_PROGRAM_ID
    const clmmProgramId = args.clmmProgramId ?? CL_SWAP_PROGRAM_ID
    const pda = new GaugePDA(programId)
    const address = pda.poolGauge({ poolId: args.poolId })
    const state = await loadState(args.connection, address)
    return new PoolGauge({ programId, cpLpEscrowProgramId, clmmProgramId, state })
  }

  get programId() {
    return this.data.programId
  }

  get clmmProgramId() {
    return this.data.clmmProgramId
  }

  get rayClPda() {
    return new RayClPda()
  }

  get pda() {
    return new GaugePDA(this.programId)
  }

  get account() {
    return this.data.state.account
  }

  get poolId() {
    return this.account.poolId
  }

  get totalVotes(): bigint {
    return BigInt(this.account.totalVotes.toString())
  }

  get lastSeenGlobalIndex(): string {
    return PreciseNumber.fromRaw(this.account.lastSeenGlobalIndex.val).valueString
  }

  get totalRayEmitted(): bigint {
    return BigInt(this.account.totalRayEmitted.toString())
  }

  get address() {
    return this.pda.poolGauge({ poolId: this.poolId })
  }

  get gaugeConfig() {
    return this.pda.globalConfig()
  }

  async reload(connection: web3.Connection) {
    const state = await loadState(connection, this.address)
    this.data.state = state
  }

  /** Sync the pool index for the gauge */
  syncIx() {
    return instructions.syncPoolIndex({
      poolGauge: this.address,
      gaugeConfig: this.gaugeConfig,
    })
  }

  /** Initialize the personal gauge for the owner */
  initPersonalGaugeIx({ owner, feePayer }: { owner: web3.PublicKey; feePayer: web3.PublicKey }) {
    const personalGauge = this.pda.personalGauge({ owner, poolGauge: this.address })
    return instructions.initPersonalGauge({
      owner,
      poolGauge: this.address,
      personalGauge,
      systemProgram: web3.SystemProgram.programId,
      feePayer,
    })
  }

  /** Initialize the personal rewarder for CP pools */
  initPersonalRewarderCpIx({ owner }: { owner: web3.PublicKey }) {
    const cpLpEscrowPda = new CpLpEscrowPDA(this.data.cpLpEscrowProgramId)
    const personalLiqPosition = cpLpEscrowPda.personalPosition({ owner, poolId: this.poolId })
    const timeTracker = cpLpEscrowPda.timeTracker({ poolId: this.poolId })

    return instructions.cpInitPersonalRewarder({
      owner,
      poolGauge: this.address,
      personalRewarder: this.pda.personalRewarderCp({ owner, poolGauge: this.address }),
      systemProgram: web3.SystemProgram.programId,
      personalLiqPosition,
      timeTracker,
      cpLpEscrowProgram: this.data.cpLpEscrowProgramId,
      gaugeConfig: this.gaugeConfig,
    })
  }

  initPersonalRewarderClIx({
    payer,
    personalLiqPosition,
    positionTickLo,
    positionTickHi,
    tickSpacing = 8,
  }: {
    payer: web3.PublicKey
    personalLiqPosition: web3.PublicKey
    positionTickLo: number
    positionTickHi: number
    tickSpacing?: number
  }) {
    const pda = this.pda
    const personalRewarder = pda.personalRewarderCl({ personalLiqPosition })
    const poolId = this.poolId
    const poolGauge = this.address
    const tickLoIndex = TickUtils.getTickArrayStartIndexByTick(positionTickLo, tickSpacing)
    const tickHiIndex = TickUtils.getTickArrayStartIndexByTick(positionTickHi, tickSpacing)
    const tickArrayLower = this.rayClPda.tickArrayAccount({ pool: poolId, index: tickLoIndex })
    const tickArrayUpper = this.rayClPda.tickArrayAccount({ pool: poolId, index: tickHiIndex })
    const protocolPosition = this.rayClPda.protocolPosition({
      pool: poolId,
      tickLo: positionTickLo,
      tickHi: positionTickHi,
    })

    return instructions.clInitPersonalRewarder({
      payer,
      gaugeConfig: this.gaugeConfig,
      personalRewarder,
      personalLiqPosition,
      protocolPosition,
      poolState: this.poolId,
      poolGauge,
      clmmProgram: this.clmmProgramId,
      systemProgram: web3.SystemProgram.programId,
      tickArrayLowerLoader: tickArrayLower,
      tickArrayUpperLoader: tickArrayUpper,
    })
  }
}

async function loadState(connection: web3.Connection, address: web3.PublicKey) {
  const account = await accounts.Gauge.fetch(connection, address)
  return { account }
}
