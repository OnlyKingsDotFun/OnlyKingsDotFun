import { PublicKey, Connection } from "@solana/web3.js"
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface TimeTrackerFields {
  /** ID of CPSwap pool */
  poolId: PublicKey
  /** Escrow account for LP tokens */
  escrow: PublicKey
  /** Non-decreasing time-unit index */
  index: types.NumberRawFields
  /** Total LP tokens deposited */
  totalLpDeposited: BN
  /** Last timestamp seen */
  lastSeenTs: BN
  bump: Array<number>
}

export interface TimeTrackerJSON {
  /** ID of CPSwap pool */
  poolId: string
  /** Escrow account for LP tokens */
  escrow: string
  /** Non-decreasing time-unit index */
  index: types.NumberRawJSON
  /** Total LP tokens deposited */
  totalLpDeposited: string
  /** Last timestamp seen */
  lastSeenTs: string
  bump: Array<number>
}

export class TimeTracker {
  /** ID of CPSwap pool */
  readonly poolId: PublicKey
  /** Escrow account for LP tokens */
  readonly escrow: PublicKey
  /** Non-decreasing time-unit index */
  readonly index: types.NumberRaw
  /** Total LP tokens deposited */
  readonly totalLpDeposited: BN
  /** Last timestamp seen */
  readonly lastSeenTs: BN
  readonly bump: Array<number>

  static readonly discriminator = Buffer.from([
    71, 160, 249, 96, 22, 104, 23, 7,
  ])

  static readonly layout = borsh.struct([
    borsh.publicKey("poolId"),
    borsh.publicKey("escrow"),
    types.NumberRaw.layout("index"),
    borsh.u64("totalLpDeposited"),
    borsh.u64("lastSeenTs"),
    borsh.array(borsh.u8(), 1, "bump"),
  ])

  constructor(fields: TimeTrackerFields) {
    this.poolId = fields.poolId
    this.escrow = fields.escrow
    this.index = new types.NumberRaw({ ...fields.index })
    this.totalLpDeposited = fields.totalLpDeposited
    this.lastSeenTs = fields.lastSeenTs
    this.bump = fields.bump
  }

  static async fetch(
    c: Connection,
    address: PublicKey,
    programId: PublicKey = PROGRAM_ID
  ): Promise<TimeTracker | null> {
    const info = await c.getAccountInfo(address)

    if (info === null) {
      return null
    }
    if (!info.owner.equals(programId)) {
      throw new Error("account doesn't belong to this program")
    }

    return this.decode(info.data)
  }

  static async fetchMultiple(
    c: Connection,
    addresses: PublicKey[],
    programId: PublicKey = PROGRAM_ID
  ): Promise<Array<TimeTracker | null>> {
    const infos = await c.getMultipleAccountsInfo(addresses)

    return infos.map((info) => {
      if (info === null) {
        return null
      }
      if (!info.owner.equals(programId)) {
        throw new Error("account doesn't belong to this program")
      }

      return this.decode(info.data)
    })
  }

  static decode(data: Buffer): TimeTracker {
    if (!data.slice(0, 8).equals(TimeTracker.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = TimeTracker.layout.decode(data.slice(8))

    return new TimeTracker({
      poolId: dec.poolId,
      escrow: dec.escrow,
      index: types.NumberRaw.fromDecoded(dec.index),
      totalLpDeposited: dec.totalLpDeposited,
      lastSeenTs: dec.lastSeenTs,
      bump: dec.bump,
    })
  }

  toJSON(): TimeTrackerJSON {
    return {
      poolId: this.poolId.toString(),
      escrow: this.escrow.toString(),
      index: this.index.toJSON(),
      totalLpDeposited: this.totalLpDeposited.toString(),
      lastSeenTs: this.lastSeenTs.toString(),
      bump: this.bump,
    }
  }

  static fromJSON(obj: TimeTrackerJSON): TimeTracker {
    return new TimeTracker({
      poolId: new PublicKey(obj.poolId),
      escrow: new PublicKey(obj.escrow),
      index: types.NumberRaw.fromJSON(obj.index),
      totalLpDeposited: new BN(obj.totalLpDeposited),
      lastSeenTs: new BN(obj.lastSeenTs),
      bump: obj.bump,
    })
  }
}
