import { PublicKey, Connection } from "@solana/web3.js"
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface GaugeConfigFields {
  /** Global token account hopper for RAY tokens to emit */
  rayHopper: PublicKey
  /** Total RAY emission per day */
  rayEmissionPerDay: BN
  /** Total votes across all gauges */
  totalVotes: BN
  /**
   * Global RAY reward index for all gauges
   * The value of RAY per-vote
   */
  index: types.NumberRawFields
  /** Time since last update */
  lastUpdatedTs: BN
  bump: Array<number>
}

export interface GaugeConfigJSON {
  /** Global token account hopper for RAY tokens to emit */
  rayHopper: string
  /** Total RAY emission per day */
  rayEmissionPerDay: string
  /** Total votes across all gauges */
  totalVotes: string
  /**
   * Global RAY reward index for all gauges
   * The value of RAY per-vote
   */
  index: types.NumberRawJSON
  /** Time since last update */
  lastUpdatedTs: string
  bump: Array<number>
}

/** Global config for all pool connected pool gauges */
export class GaugeConfig {
  /** Global token account hopper for RAY tokens to emit */
  readonly rayHopper: PublicKey
  /** Total RAY emission per day */
  readonly rayEmissionPerDay: BN
  /** Total votes across all gauges */
  readonly totalVotes: BN
  /**
   * Global RAY reward index for all gauges
   * The value of RAY per-vote
   */
  readonly index: types.NumberRaw
  /** Time since last update */
  readonly lastUpdatedTs: BN
  readonly bump: Array<number>

  static readonly discriminator = Buffer.from([
    162, 113, 190, 180, 118, 167, 38, 30,
  ])

  static readonly layout = borsh.struct([
    borsh.publicKey("rayHopper"),
    borsh.u64("rayEmissionPerDay"),
    borsh.u64("totalVotes"),
    types.NumberRaw.layout("index"),
    borsh.u64("lastUpdatedTs"),
    borsh.array(borsh.u8(), 1, "bump"),
  ])

  constructor(fields: GaugeConfigFields) {
    this.rayHopper = fields.rayHopper
    this.rayEmissionPerDay = fields.rayEmissionPerDay
    this.totalVotes = fields.totalVotes
    this.index = new types.NumberRaw({ ...fields.index })
    this.lastUpdatedTs = fields.lastUpdatedTs
    this.bump = fields.bump
  }

  static async fetch(
    c: Connection,
    address: PublicKey,
    programId: PublicKey = PROGRAM_ID
  ): Promise<GaugeConfig | null> {
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
  ): Promise<Array<GaugeConfig | null>> {
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

  static decode(data: Buffer): GaugeConfig {
    if (!data.slice(0, 8).equals(GaugeConfig.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = GaugeConfig.layout.decode(data.slice(8))

    return new GaugeConfig({
      rayHopper: dec.rayHopper,
      rayEmissionPerDay: dec.rayEmissionPerDay,
      totalVotes: dec.totalVotes,
      index: types.NumberRaw.fromDecoded(dec.index),
      lastUpdatedTs: dec.lastUpdatedTs,
      bump: dec.bump,
    })
  }

  toJSON(): GaugeConfigJSON {
    return {
      rayHopper: this.rayHopper.toString(),
      rayEmissionPerDay: this.rayEmissionPerDay.toString(),
      totalVotes: this.totalVotes.toString(),
      index: this.index.toJSON(),
      lastUpdatedTs: this.lastUpdatedTs.toString(),
      bump: this.bump,
    }
  }

  static fromJSON(obj: GaugeConfigJSON): GaugeConfig {
    return new GaugeConfig({
      rayHopper: new PublicKey(obj.rayHopper),
      rayEmissionPerDay: new BN(obj.rayEmissionPerDay),
      totalVotes: new BN(obj.totalVotes),
      index: types.NumberRaw.fromJSON(obj.index),
      lastUpdatedTs: new BN(obj.lastUpdatedTs),
      bump: obj.bump,
    })
  }
}
