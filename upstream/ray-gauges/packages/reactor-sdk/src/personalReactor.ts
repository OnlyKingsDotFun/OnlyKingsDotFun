import { BN, web3 } from "@coral-xyz/anchor"
import { ReactorPda } from "./pda"
import { PROGRAM_ID, accounts, instructions } from "@raygauge/reactor-gen"
import { TOKEN_PROGRAM_ID } from "@solana/spl-token"
import { PreciseNumber } from "@raygauge/number"
import { SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js"

export interface ReactorSdkConfig {
  /** The Reactor program id */
  programId?: web3.PublicKey
  state: {
    account: accounts.Reactor
  }
}

export interface LoadArgs {
  /** The Reactor program id */
  programId?: web3.PublicKey
  /** The owner of the reactor */
  owner: web3.PublicKey
  connection: web3.Connection
}

/** Personal Reactor SDK */
export class ReactorSdk {
  pda: ReactorPda
  programId: web3.PublicKey

  constructor(private config: ReactorSdkConfig) {
    this.programId = config.programId || PROGRAM_ID
    this.pda = new ReactorPda({
      programId: config.programId,
    })
  }

  /** Load a ReactorSdk2 instance from an RPC connection */
  static async load(args: LoadArgs) {
    const programId = args.programId || PROGRAM_ID
    const pda = new ReactorPda({ programId })
    const address = pda.reactor({ owner: args.owner })
    const state = await loadState(args.connection, address)
    return new ReactorSdk({
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

  get owner() {
    return this.state.account.owner
  }

  get selfAddress() {
    return this.pda.reactor({ owner: this.owner })
  }

  get depositedRayBalance(): bigint {
    return BigInt(this.state.account.ray.toString())
  }

  get isoRayBalance(): bigint {
    return BigInt(this.state.account.isoRay.toString())
  }

  get lockedVotes(): bigint {
    return BigInt(this.state.account.lockedVotes.toString())
  }

  get uncollectedRayRewards(): bigint {
    return BigInt(this.state.account.rayStakeRewards.uncollectedRayReward.toString())
  }

  get lastSeenRayStakeRewardsIndex(): string {
    const n = PreciseNumber.fromRaw(this.state.account.rayStakeRewards.lastSeenIndex.val)
    return n.valueString
  }

  get lastSeenIsoRayIndex(): string {
    const n = PreciseNumber.fromRaw(this.state.account.lastSeenIndexIsoRay.val)
    return n.valueString
  }

  /** Deposit RAY into the reactor */
  ixDepositRay({ amount, raySrc }: { amount: bigint; raySrc: web3.PublicKey }) {
    return instructions.depositRay(
      { amount: new BN(amount.toString()) },
      {
        owner: this.owner,
        raySrc,
        reactor: this.selfAddress,
        rayVault: this.pda.rayVault(),
        reactorConfig: this.pda.tenant(),
        tokenProgram: TOKEN_PROGRAM_ID,
      },
    )
  }

  /** Withdraw RAY from the reactor */
  ixWithdrawRay({ amount, rayDst }: { amount: bigint; rayDst: web3.PublicKey }) {
    return instructions.withdrawRay(
      { amount: new BN(amount.toString()) },
      {
        owner: this.owner,
        rayDst,
        reactor: this.selfAddress,
        rayVault: this.pda.rayVault(),
        reactorConfig: this.pda.tenant(),
        tokenProgram: TOKEN_PROGRAM_ID,
      },
    )
  }

  /** Lock votes on the reactor (note - this should not be called directly, but only through CPI in the gov module) */
  ixLockVotes({ amount }: { amount: bigint }) {
    return instructions.lockVotes(
      { amount: new BN(amount.toString()) },
      { owner: this.owner, reactor: this.selfAddress, sysvarInstruction: SYSVAR_INSTRUCTIONS_PUBKEY },
    )
  }

  /** Unlock votes on the reactor (note - this should not be called directly, but only through CPI in the gov module) */
  ixUnlockVotes({ amount }: { amount: bigint }) {
    return instructions.unlockVotes(
      { amount: new BN(amount.toString()) },
      { owner: this.owner, reactor: this.selfAddress, sysvarInstruction: SYSVAR_INSTRUCTIONS_PUBKEY },
    )
  }

  /** Collect the earned RAY rewards */
  ixCollectRayRewards() {
    return instructions.collectRayRewards({
      owner: this.owner,
      reactor: this.selfAddress,
      reactorConfig: this.pda.tenant(),
      rayRewardHopper: this.pda.rayHopper(),
      rayDst: this.pda.rayVault(),
      tokenProgram: TOKEN_PROGRAM_ID,
    })
  }

  toJson() {
    return toJson(this)
  }
}

/** Load the state of the Reactor Tenant */
async function loadState(connection: web3.Connection, address: web3.PublicKey) {
  const account = await accounts.Reactor.fetch(connection, address)
  return { account }
}

function toJson(x: ReactorSdk): ReactorJson {
  return {
    selfAddress: x.selfAddress.toBase58(),
    owner: x.owner.toBase58(),
    rayBalance: x.depositedRayBalance.toString(),
    lockedVotes: x.lockedVotes.toString(),
    isoRay: x.isoRayBalance.toString(),
    lastSeenIsoRayIndex: x.lastSeenIsoRayIndex,
    uncollectedRayRewards: x.uncollectedRayRewards.toString(),
    lastSeenRayStakeRewardsIndex: x.lastSeenRayStakeRewardsIndex,
  }
}

export interface ReactorJson {
  /** The address of the reactor */
  selfAddress: string
  owner: string
  /** The balance of RAY deposited into the reactor */
  rayBalance: string
  /** The number of votes locked in the reactor */
  lockedVotes: string
  /** The balance of isoRAY in the reactor */
  isoRay: string
  /** The last seen index for isoRAY accrual */
  lastSeenIsoRayIndex: string
  /** The uncollected RAY rewards from staking */
  uncollectedRayRewards: string
  /** The last seen index for RAY rewards from staking */
  lastSeenRayStakeRewardsIndex: string
}
