import { PublicKey, Connection } from "@solana/web3.js"
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface PersonalRewarderFields {
  owner: PublicKey
  poolGauge: PublicKey
  /** High-precision number for last seen earned time units */
  lastSeenTimeUnits: types.NumberRawFields
  /** Last seen total RAY emitted */
  lastSeenTotalEmittedRay: BN
  /** Timestamp of last update */
  lastUpdatedTs: BN
  /** amount of RAY earned by user */
  stagedRay: BN
}

export interface PersonalRewarderJSON {
  owner: string
  poolGauge: string
  /** High-precision number for last seen earned time units */
  lastSeenTimeUnits: types.NumberRawJSON
  /** Last seen total RAY emitted */
  lastSeenTotalEmittedRay: string
  /** Timestamp of last update */
  lastUpdatedTs: string
  /** amount of RAY earned by user */
  stagedRay: string
}

export class PersonalRewarder {
  readonly owner: PublicKey
  readonly poolGauge: PublicKey
  /** High-precision number for last seen earned time units */
  readonly lastSeenTimeUnits: types.NumberRaw
  /** Last seen total RAY emitted */
  readonly lastSeenTotalEmittedRay: BN
  /** Timestamp of last update */
  readonly lastUpdatedTs: BN
  /** amount of RAY earned by user */
  readonly stagedRay: BN

  static readonly discriminator = Buffer.from([
    44, 131, 189, 234, 235, 184, 14, 178,
  ])

  static readonly layout = borsh.struct([
    borsh.publicKey("owner"),
    borsh.publicKey("poolGauge"),
    types.NumberRaw.layout("lastSeenTimeUnits"),
    borsh.u64("lastSeenTotalEmittedRay"),
    borsh.u64("lastUpdatedTs"),
    borsh.u64("stagedRay"),
  ])

  constructor(fields: PersonalRewarderFields) {
    this.owner = fields.owner
    this.poolGauge = fields.poolGauge
    this.lastSeenTimeUnits = new types.NumberRaw({
      ...fields.lastSeenTimeUnits,
    })
    this.lastSeenTotalEmittedRay = fields.lastSeenTotalEmittedRay
    this.lastUpdatedTs = fields.lastUpdatedTs
    this.stagedRay = fields.stagedRay
  }

  static async fetch(
    c: Connection,
    address: PublicKey,
    programId: PublicKey = PROGRAM_ID
  ): Promise<PersonalRewarder | null> {
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
  ): Promise<Array<PersonalRewarder | null>> {
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

  static decode(data: Buffer): PersonalRewarder {
    if (!data.slice(0, 8).equals(PersonalRewarder.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = PersonalRewarder.layout.decode(data.slice(8))

    return new PersonalRewarder({
      owner: dec.owner,
      poolGauge: dec.poolGauge,
      lastSeenTimeUnits: types.NumberRaw.fromDecoded(dec.lastSeenTimeUnits),
      lastSeenTotalEmittedRay: dec.lastSeenTotalEmittedRay,
      lastUpdatedTs: dec.lastUpdatedTs,
      stagedRay: dec.stagedRay,
    })
  }

  toJSON(): PersonalRewarderJSON {
    return {
      owner: this.owner.toString(),
      poolGauge: this.poolGauge.toString(),
      lastSeenTimeUnits: this.lastSeenTimeUnits.toJSON(),
      lastSeenTotalEmittedRay: this.lastSeenTotalEmittedRay.toString(),
      lastUpdatedTs: this.lastUpdatedTs.toString(),
      stagedRay: this.stagedRay.toString(),
    }
  }

  static fromJSON(obj: PersonalRewarderJSON): PersonalRewarder {
    return new PersonalRewarder({
      owner: new PublicKey(obj.owner),
      poolGauge: new PublicKey(obj.poolGauge),
      lastSeenTimeUnits: types.NumberRaw.fromJSON(obj.lastSeenTimeUnits),
      lastSeenTotalEmittedRay: new BN(obj.lastSeenTotalEmittedRay),
      lastUpdatedTs: new BN(obj.lastUpdatedTs),
      stagedRay: new BN(obj.stagedRay),
    })
  }
}
