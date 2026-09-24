import { web3 } from "@coral-xyz/anchor"
import { ReactorPda } from "./pda"
import { PROGRAM_ID, accounts, instructions } from "@raygauge/reactor-gen"
import { getTokenAccountBalance } from "@raygauge/solbox"
import { PreciseNumber } from "@raygauge/number"

export interface ReactorTenantSdk2Config {
  /** The Reactor program id */
  programId?: web3.PublicKey
  state: {
    account: accounts.ReactorConfig
    /** The balance of the ray hopper, used for emissions */
    rayHopperBalance: bigint
    /** The balance of the ray vault, used for deposits */
    rayVaultBalance: bigint
  }
}

export interface LoadArgs {
  programId?: web3.PublicKey
  connection: web3.Connection
}

/** Global Reactor Tenant SDK */
export class ReactorTenantSdk {
  pda: ReactorPda
  programId: web3.PublicKey

  constructor(private config: ReactorTenantSdk2Config) {
    this.programId = config.programId || PROGRAM_ID
    this.pda = new ReactorPda({
      programId: config.programId,
    })
  }

  /** Load a ReactorSdk2 instance from an RPC connection */
  static async load(args: LoadArgs) {
    const programId = args.programId || PROGRAM_ID
    const pda = new ReactorPda({ programId })
    const address = pda.tenant()
    const state = await loadState(args.connection, address)
    return new ReactorTenantSdk({
      programId: args.programId,
      state,
    })
  }

  /** Reload the state from an RPC connection */
  async reload(cnx: web3.Connection) {
    const state = await loadState(cnx, this.selfAddress)
    this.config.state = state
  }

  get state() {
    return this.config.state
  }

  /** The address of the tenant */
  get selfAddress() {
    return this.pda.tenant()
  }

  /** The address of the ray vault */
  get rayVault() {
    return this.pda.rayVault()
  }

  /** The total amount of RAY deposited into the global reactor program */
  get totalRayDeposited() {
    return BigInt(this.state.account.totalRayDeposited.toString())
  }

  get rayMint() {
    return this.state.account.rayMint
  }

  get rayRewardHopper() {
    return this.state.account.rayRewardHopper
  }

  /** The current per-RAY index for RAY emissions */
  get rayRewardIndex() {
    const n = PreciseNumber.fromRaw(this.state.account.rayRewardIndex.val)
    return n.valueString
  }

  get isoRayAprBps() {
    return this.state.account.isoRayAprBps
  }

  /** The APR for isoRAY, as a percentage */
  get isoRayApr() {
    return this.isoRayAprBps / 100_00
  }

  /** The current per-RAY index for isoRAY accrual */
  get isoRayIndex() {
    const n = PreciseNumber.fromRaw(this.state.account.isoRayIndex.val)
    return n.valueString
  }

  get rayRewardDailyEmission() {
    return BigInt(this.state.account.rayRewardDailyEmission.toString())
  }

  /** The last time rewards were emitted */
  get rewardsEmittedUntil() {
    return BigInt(this.state.account.rewardsEmittedUntil.toString())
  }

  /** Initialize a persona reactor account */
  initReactorIx({ payer, owner }: { payer: web3.PublicKey; owner?: web3.PublicKey }) {
    // owner defaults to payer
    owner = owner || payer

    return instructions.initReactor({
      payer,
      owner,
      reactor: this.pda.reactor({ owner }),
      systemProgram: web3.SystemProgram.programId,
    })
  }

  toJson() {
    return toJson(this)
  }
}

/** Load the state of the Reactor Tenant */
async function loadState(connection: web3.Connection, address: web3.PublicKey) {
  const account = await accounts.ReactorConfig.fetch(connection, address)
  const rayHopperBalanceP = getTokenAccountBalance(connection, account.rayRewardHopper)
  const rayVaultBalanceP = getTokenAccountBalance(connection, account.rayVault)
  const [rayHopperBalance, rayVaultBalance] = await Promise.all([rayHopperBalanceP, rayVaultBalanceP])
  return { account, rayHopperBalance, rayVaultBalance }
}

export interface ReactorTenantJson {
  /** The address of the tenant */
  selfAddress: string
  /** The total amount of RAY deposited into the global reactor program */
  totalRayDeposited: string
  /** The address of the RAY mint */
  rayMint: string
  /** The address of the ray reward hopper */
  rayRewardHopper: string
  /** The current per-RAY index for RAY emissions */
  rayRewardIndex: string
  /** The APR for isoRAY, as a percentage */
  isoRayApr: number
  /** The current per-RAY index for isoRAY accrual */
  isoRayIndex: string
  /** The daily emission rate of RAY rewards */
  rayRewardDailyEmission: string
  /** The last time rewards were emitted */
  rewardsEmittedUntil: string
}

function toJson(x: ReactorTenantSdk): ReactorTenantJson {
  return {
    selfAddress: x.selfAddress.toBase58(),
    totalRayDeposited: x.totalRayDeposited.toString(),
    rayMint: x.rayMint.toBase58(),
    rayRewardHopper: x.rayRewardHopper.toBase58(),
    rayRewardIndex: x.rayRewardIndex,
    isoRayApr: x.isoRayApr,
    isoRayIndex: x.isoRayIndex,
    rayRewardDailyEmission: x.rayRewardDailyEmission.toString(),
    rewardsEmittedUntil: x.rewardsEmittedUntil.toString(),
  }
}
