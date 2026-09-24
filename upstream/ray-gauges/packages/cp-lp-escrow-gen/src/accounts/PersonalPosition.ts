import { PublicKey, Connection } from "@solana/web3.js"
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface PersonalPositionFields {
  owner: PublicKey
  /** Amount of liquidity */
  amount: BN
  /** Link to time tracker */
  timeTracker: PublicKey
  lastSeenIndex: types.NumberRawFields
  /** High-precision number representation of earned units */
  earnedTimeUnits: types.NumberRawFields
}

export interface PersonalPositionJSON {
  owner: string
  /** Amount of liquidity */
  amount: string
  /** Link to time tracker */
  timeTracker: string
  lastSeenIndex: types.NumberRawJSON
  /** High-precision number representation of earned units */
  earnedTimeUnits: types.NumberRawJSON
}

export class PersonalPosition {
  readonly owner: PublicKey
  /** Amount of liquidity */
  readonly amount: BN
  /** Link to time tracker */
  readonly timeTracker: PublicKey
  readonly lastSeenIndex: types.NumberRaw
  /** High-precision number representation of earned units */
  readonly earnedTimeUnits: types.NumberRaw

  static readonly discriminator = Buffer.from([
    40, 172, 123, 89, 170, 15, 56, 141,
  ])

  static readonly layout = borsh.struct([
    borsh.publicKey("owner"),
    borsh.u64("amount"),
    borsh.publicKey("timeTracker"),
    types.NumberRaw.layout("lastSeenIndex"),
    types.NumberRaw.layout("earnedTimeUnits"),
  ])

  constructor(fields: PersonalPositionFields) {
    this.owner = fields.owner
    this.amount = fields.amount
    this.timeTracker = fields.timeTracker
    this.lastSeenIndex = new types.NumberRaw({ ...fields.lastSeenIndex })
    this.earnedTimeUnits = new types.NumberRaw({ ...fields.earnedTimeUnits })
  }

  static async fetch(
    c: Connection,
    address: PublicKey,
    programId: PublicKey = PROGRAM_ID
  ): Promise<PersonalPosition | null> {
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
  ): Promise<Array<PersonalPosition | null>> {
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

  static decode(data: Buffer): PersonalPosition {
    if (!data.slice(0, 8).equals(PersonalPosition.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = PersonalPosition.layout.decode(data.slice(8))

    return new PersonalPosition({
      owner: dec.owner,
      amount: dec.amount,
      timeTracker: dec.timeTracker,
      lastSeenIndex: types.NumberRaw.fromDecoded(dec.lastSeenIndex),
      earnedTimeUnits: types.NumberRaw.fromDecoded(dec.earnedTimeUnits),
    })
  }

  toJSON(): PersonalPositionJSON {
    return {
      owner: this.owner.toString(),
      amount: this.amount.toString(),
      timeTracker: this.timeTracker.toString(),
      lastSeenIndex: this.lastSeenIndex.toJSON(),
      earnedTimeUnits: this.earnedTimeUnits.toJSON(),
    }
  }

  static fromJSON(obj: PersonalPositionJSON): PersonalPosition {
    return new PersonalPosition({
      owner: new PublicKey(obj.owner),
      amount: new BN(obj.amount),
      timeTracker: new PublicKey(obj.timeTracker),
      lastSeenIndex: types.NumberRaw.fromJSON(obj.lastSeenIndex),
      earnedTimeUnits: types.NumberRaw.fromJSON(obj.earnedTimeUnits),
    })
  }
}
