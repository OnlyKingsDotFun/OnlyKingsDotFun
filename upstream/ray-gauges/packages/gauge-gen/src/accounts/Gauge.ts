import { PublicKey, Connection } from "@solana/web3.js"
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface GaugeFields {
  /**
   * The pool id that this gauge is connected to
   * This can be a Constant Product pool or a Concentrated Liquidity pool
   */
  poolId: PublicKey
  /** Total votes in this gauge */
  totalVotes: BN
  /** The snapshot of the global index when the pool was last updated */
  lastSeenGlobalIndex: types.NumberRawFields
  /** Lifetime total RAY emitted by this gauge */
  totalRayEmitted: BN
}

export interface GaugeJSON {
  /**
   * The pool id that this gauge is connected to
   * This can be a Constant Product pool or a Concentrated Liquidity pool
   */
  poolId: string
  /** Total votes in this gauge */
  totalVotes: string
  /** The snapshot of the global index when the pool was last updated */
  lastSeenGlobalIndex: types.NumberRawJSON
  /** Lifetime total RAY emitted by this gauge */
  totalRayEmitted: string
}

/** The specific gauge for a pool */
export class Gauge {
  /**
   * The pool id that this gauge is connected to
   * This can be a Constant Product pool or a Concentrated Liquidity pool
   */
  readonly poolId: PublicKey
  /** Total votes in this gauge */
  readonly totalVotes: BN
  /** The snapshot of the global index when the pool was last updated */
  readonly lastSeenGlobalIndex: types.NumberRaw
  /** Lifetime total RAY emitted by this gauge */
  readonly totalRayEmitted: BN

  static readonly discriminator = Buffer.from([
    9, 19, 249, 189, 158, 171, 226, 205,
  ])

  static readonly layout = borsh.struct([
    borsh.publicKey("poolId"),
    borsh.u64("totalVotes"),
    types.NumberRaw.layout("lastSeenGlobalIndex"),
    borsh.u64("totalRayEmitted"),
  ])

  constructor(fields: GaugeFields) {
    this.poolId = fields.poolId
    this.totalVotes = fields.totalVotes
    this.lastSeenGlobalIndex = new types.NumberRaw({
      ...fields.lastSeenGlobalIndex,
    })
    this.totalRayEmitted = fields.totalRayEmitted
  }

  static async fetch(
    c: Connection,
    address: PublicKey,
    programId: PublicKey = PROGRAM_ID
  ): Promise<Gauge | null> {
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
  ): Promise<Array<Gauge | null>> {
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

  static decode(data: Buffer): Gauge {
    if (!data.slice(0, 8).equals(Gauge.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = Gauge.layout.decode(data.slice(8))

    return new Gauge({
      poolId: dec.poolId,
      totalVotes: dec.totalVotes,
      lastSeenGlobalIndex: types.NumberRaw.fromDecoded(dec.lastSeenGlobalIndex),
      totalRayEmitted: dec.totalRayEmitted,
    })
  }

  toJSON(): GaugeJSON {
    return {
      poolId: this.poolId.toString(),
      totalVotes: this.totalVotes.toString(),
      lastSeenGlobalIndex: this.lastSeenGlobalIndex.toJSON(),
      totalRayEmitted: this.totalRayEmitted.toString(),
    }
  }

  static fromJSON(obj: GaugeJSON): Gauge {
    return new Gauge({
      poolId: new PublicKey(obj.poolId),
      totalVotes: new BN(obj.totalVotes),
      lastSeenGlobalIndex: types.NumberRaw.fromJSON(obj.lastSeenGlobalIndex),
      totalRayEmitted: new BN(obj.totalRayEmitted),
    })
  }
}
