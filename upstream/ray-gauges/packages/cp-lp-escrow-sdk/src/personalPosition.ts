import { BN, web3 } from "@coral-xyz/anchor"
import { accounts, instructions, PROGRAM_ID } from "@raygauge/cp-lp-escrow-gen"
import { CpLpEscrowPDA } from "@raygauge/cp-lp-escrow-pda"
import { PreciseNumber } from "@raygauge/number"
import { TOKEN_PROGRAM_ID } from "@solana/spl-token"

export interface CpLpEscrowPersonalPositionLoadArgs {
  connection: web3.Connection
  poolId: web3.PublicKey
  owner: web3.PublicKey
  programId?: web3.PublicKey
}

type CpLpEscrowPersonalPositionConfig = {
  programId?: web3.PublicKey
  poolId: web3.PublicKey
  selfAddress: web3.PublicKey
  state: {
    account: accounts.PersonalPosition
  }
}

/** SDK for interacting with a personal position */
export class CpLpEscrowPersonalPosition {
  programId: web3.PublicKey
  pda: CpLpEscrowPDA

  constructor(private config: CpLpEscrowPersonalPositionConfig) {
    this.programId = config.programId || PROGRAM_ID
    this.pda = new CpLpEscrowPDA(this.programId)
  }

  static async load(args: CpLpEscrowPersonalPositionLoadArgs) {
    const pda = new CpLpEscrowPDA(args.programId)
    const address = pda.personalPosition({ poolId: args.poolId, owner: args.owner })
    const state = await loadState(args.connection, address)
    return new CpLpEscrowPersonalPosition({
      programId: args.programId,
      poolId: args.poolId,
      selfAddress: address,
      state,
    })
  }

  async reload(connection: web3.Connection) {
    const state = await loadState(connection, this.config.selfAddress)
    this.config.state = state
  }

  /** Deposit LP tokens into the escrow */
  depositIx({ amount, lpSrc }: { amount: bigint; lpSrc: web3.PublicKey }) {
    return instructions.deposit(
      { amount: new BN(amount.toString()) },
      {
        owner: this.owner,
        timeTracker: this.timeTracker,
        personalPosition: this.selfAddress,
        escrow: this.escrowAddress,
        lpSrc,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
    )
  }

  /** Withdraw LP tokens from the escrow */
  withdrawIx({ amount, lpDst }: { amount: bigint; lpDst: web3.PublicKey }) {
    return instructions.withdraw(
      { amount: new BN(amount.toString()) },
      {
        owner: this.owner,
        timeTracker: this.timeTracker,
        personalPosition: this.selfAddress,
        escrow: this.escrowAddress,
        lpDst,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
    )
  }

  /** Sync the personal position's earned time units */
  syncIx() {
    return instructions.updatePersonalPosition({
      personalPosition: this.selfAddress,
      timeTracker: this.timeTracker,
    })
  }

  get state() {
    return this.config.state
  }

  /** Address of the escrow account for LP tokens */
  get escrowAddress() {
    return this.pda.lpEscrow({ poolId: this.poolId })
  }

  get owner() {
    return this.state.account.owner
  }

  /** Address of the pool */
  get poolId() {
    return this.config.poolId
  }

  /** Address of the time tracker */
  get timeTracker() {
    return this.state.account.timeTracker
  }

  /** Laste seen reward index */
  get lastSeenIndex(): string {
    return PreciseNumber.fromRaw(this.state.account.lastSeenIndex.val).valueString
  }

  /** High-precision number representation of earned units */
  get earnedTimeUnits(): string {
    return PreciseNumber.fromRaw(this.state.account.earnedTimeUnits.val).valueString
  }

  /** Balance of LP tokens */
  get balance(): bigint {
    return BigInt(this.state.account.amount.toString())
  }

  /** Address of the personal position */
  get selfAddress(): web3.PublicKey {
    return this.config.selfAddress
  }

  toJson(): CpLpEscrowPersonalPositionJson {
    return toJson(this)
  }
}

async function loadState(connection: web3.Connection, address: web3.PublicKey) {
  const account = await accounts.PersonalPosition.fetch(connection, address)
  return { account }
}

function toJson(sdk: CpLpEscrowPersonalPosition): CpLpEscrowPersonalPositionJson {
  return {
    selfAddress: sdk.selfAddress.toBase58(),
    owner: sdk.owner.toBase58(),
    balance: sdk.balance.toString(),
    lastSeenIndex: sdk.lastSeenIndex,
    earnedTimeUnits: sdk.earnedTimeUnits,
    timeTracker: sdk.timeTracker.toBase58(),
    poolId: sdk.poolId.toBase58(),
  }
}

export interface CpLpEscrowPersonalPositionJson {
  /** Address of the personal position */
  selfAddress: string
  /** Address of the owner */
  owner: string
  /** Balance of LP tokens */
  balance: string
  /** Laste seen reward index */
  lastSeenIndex: string
  /** High-precision number representation of earned units */
  earnedTimeUnits: string
  /** Address of the time tracker */
  timeTracker: string
  /** Address of the pool */
  poolId: string
}
