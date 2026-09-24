import { PublicKey } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"

export interface PersonalRewarderStateFields {
  /** High-precision number for last seen earned time units */
  lastSeenTimeUnits: types.NumberRawFields
  /** Last seen total RAY emitted */
  lastSeenTotalEmittedRay: BN
  /** Timestamp of last update */
  lastUpdatedTs: BN
  /** amount of RAY earned by user */
  stagedRay: BN
}

export interface PersonalRewarderStateJSON {
  /** High-precision number for last seen earned time units */
  lastSeenTimeUnits: types.NumberRawJSON
  /** Last seen total RAY emitted */
  lastSeenTotalEmittedRay: string
  /** Timestamp of last update */
  lastUpdatedTs: string
  /** amount of RAY earned by user */
  stagedRay: string
}

/**
 * Common state for personal rewarders
 * Shared between CP and CL rewarders
 */
export class PersonalRewarderState {
  /** High-precision number for last seen earned time units */
  readonly lastSeenTimeUnits: types.NumberRaw
  /** Last seen total RAY emitted */
  readonly lastSeenTotalEmittedRay: BN
  /** Timestamp of last update */
  readonly lastUpdatedTs: BN
  /** amount of RAY earned by user */
  readonly stagedRay: BN

  constructor(fields: PersonalRewarderStateFields) {
    this.lastSeenTimeUnits = new types.NumberRaw({
      ...fields.lastSeenTimeUnits,
    })
    this.lastSeenTotalEmittedRay = fields.lastSeenTotalEmittedRay
    this.lastUpdatedTs = fields.lastUpdatedTs
    this.stagedRay = fields.stagedRay
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        types.NumberRaw.layout("lastSeenTimeUnits"),
        borsh.u64("lastSeenTotalEmittedRay"),
        borsh.u64("lastUpdatedTs"),
        borsh.u64("stagedRay"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new PersonalRewarderState({
      lastSeenTimeUnits: types.NumberRaw.fromDecoded(obj.lastSeenTimeUnits),
      lastSeenTotalEmittedRay: obj.lastSeenTotalEmittedRay,
      lastUpdatedTs: obj.lastUpdatedTs,
      stagedRay: obj.stagedRay,
    })
  }

  static toEncodable(fields: PersonalRewarderStateFields) {
    return {
      lastSeenTimeUnits: types.NumberRaw.toEncodable(fields.lastSeenTimeUnits),
      lastSeenTotalEmittedRay: fields.lastSeenTotalEmittedRay,
      lastUpdatedTs: fields.lastUpdatedTs,
      stagedRay: fields.stagedRay,
    }
  }

  toJSON(): PersonalRewarderStateJSON {
    return {
      lastSeenTimeUnits: this.lastSeenTimeUnits.toJSON(),
      lastSeenTotalEmittedRay: this.lastSeenTotalEmittedRay.toString(),
      lastUpdatedTs: this.lastUpdatedTs.toString(),
      stagedRay: this.stagedRay.toString(),
    }
  }

  static fromJSON(obj: PersonalRewarderStateJSON): PersonalRewarderState {
    return new PersonalRewarderState({
      lastSeenTimeUnits: types.NumberRaw.fromJSON(obj.lastSeenTimeUnits),
      lastSeenTotalEmittedRay: new BN(obj.lastSeenTotalEmittedRay),
      lastUpdatedTs: new BN(obj.lastUpdatedTs),
      stagedRay: new BN(obj.stagedRay),
    })
  }

  toEncodable() {
    return PersonalRewarderState.toEncodable(this)
  }
}
