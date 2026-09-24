import { PublicKey } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"

export interface ObservationFields {
  /** The block timestamp of the observation */
  blockTimestamp: number
  /** the cumulative of tick during the duration time */
  tickCumulative: BN
  /** padding for feature update */
  padding: Array<BN>
}

export interface ObservationJSON {
  /** The block timestamp of the observation */
  blockTimestamp: number
  /** the cumulative of tick during the duration time */
  tickCumulative: string
  /** padding for feature update */
  padding: Array<string>
}

/** The element of observations in ObservationState */
export class Observation {
  /** The block timestamp of the observation */
  readonly blockTimestamp: number
  /** the cumulative of tick during the duration time */
  readonly tickCumulative: BN
  /** padding for feature update */
  readonly padding: Array<BN>

  constructor(fields: ObservationFields) {
    this.blockTimestamp = fields.blockTimestamp
    this.tickCumulative = fields.tickCumulative
    this.padding = fields.padding
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.u32("blockTimestamp"),
        borsh.i64("tickCumulative"),
        borsh.array(borsh.u64(), 4, "padding"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new Observation({
      blockTimestamp: obj.blockTimestamp,
      tickCumulative: obj.tickCumulative,
      padding: obj.padding,
    })
  }

  static toEncodable(fields: ObservationFields) {
    return {
      blockTimestamp: fields.blockTimestamp,
      tickCumulative: fields.tickCumulative,
      padding: fields.padding,
    }
  }

  toJSON(): ObservationJSON {
    return {
      blockTimestamp: this.blockTimestamp,
      tickCumulative: this.tickCumulative.toString(),
      padding: this.padding.map((item) => item.toString()),
    }
  }

  static fromJSON(obj: ObservationJSON): Observation {
    return new Observation({
      blockTimestamp: obj.blockTimestamp,
      tickCumulative: new BN(obj.tickCumulative),
      padding: obj.padding.map((item) => new BN(item)),
    })
  }

  toEncodable() {
    return Observation.toEncodable(this)
  }
}
