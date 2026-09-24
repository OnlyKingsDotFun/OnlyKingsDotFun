import { web3 } from "@coral-xyz/anchor"
import { accounts, instructions } from "@raygauge/cp-lp-escrow-gen"
import { CpLpEscrowPDA } from "@raygauge/cp-lp-escrow-pda"
import { PreciseNumber } from "@raygauge/number"

interface CpLpEscrowConfig {
  programId?: web3.PublicKey
  selfAddress: web3.PublicKey
  state: {
    account: accounts.TimeTracker
  }
}
export interface CpLpEscrowLoadArgs {
  connection: web3.Connection
  poolId: web3.PublicKey
  programId?: web3.PublicKey
}

/** SDK for interacting with the escrow time-tracker */
export class CpLpEscrow {
  pda: CpLpEscrowPDA
  constructor(private config: CpLpEscrowConfig) {
    this.pda = new CpLpEscrowPDA(config.programId)
  }

  static async load(args: CpLpEscrowLoadArgs) {
    const pda = new CpLpEscrowPDA(args.programId)
    const address = pda.timeTracker({ poolId: args.poolId })
    const state = await loadState(args.connection, address)
    return new CpLpEscrow({
      programId: args.programId,
      selfAddress: address,
      state,
    })
  }

  async reload(connection: web3.Connection) {
    const state = await loadState(connection, this.config.selfAddress)
    this.config.state = state
  }

  initPersonalPositionIx({ owner }: { owner: web3.PublicKey }) {
    const personalPosition = this.pda.personalPosition({ poolId: this.poolId, owner })
    return instructions.initPersonalPosition({
      owner,
      timeTracker: this.config.selfAddress,
      personalPosition,
      systemProgram: web3.SystemProgram.programId,
    })
  }

  get state() {
    return this.config.state
  }

  get selfAddress() {
    return this.config.selfAddress
  }

  /** ID of CPSwap pool */
  get poolId() {
    return this.state.account.poolId
  }

  /** Address of the escrow account for LP tokens */
  get escrow() {
    return this.state.account.escrow
  }

  /** Non-decreasing time-unit index */
  get index() {
    return PreciseNumber.fromRaw(this.state.account.index.val).valueString
  }

  /** Total LP tokens deposited */
  get totalLpDeposited(): bigint {
    return BigInt(this.state.account.totalLpDeposited.toString())
  }

  /** Last timestamp seen */
  get lastSeenTs(): bigint {
    return BigInt(this.state.account.lastSeenTs.toString())
  }

  toJson(): CpLpEscrowJson {
    return toJson(this)
  }
}

export interface CpLpEscrowJson {
  poolId: string
  escrow: string
  index: string
  totalLpDeposited: string
  lastSeenTs: string
}

function toJson(sdk: CpLpEscrow): CpLpEscrowJson {
  return {
    poolId: sdk.poolId.toBase58(),
    escrow: sdk.escrow.toBase58(),
    index: sdk.index,
    totalLpDeposited: sdk.totalLpDeposited.toString(),
    lastSeenTs: sdk.lastSeenTs.toString(),
  }
}

async function loadState(connection: web3.Connection, address: web3.PublicKey) {
  const account = await accounts.TimeTracker.fetch(connection, address)
  return {
    account,
  }
}
