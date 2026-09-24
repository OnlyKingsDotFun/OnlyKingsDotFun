import { PublicKey, Connection } from "@solana/web3.js"
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface PersonalGaugeFields {
  /** owner of personal gauge */
  owner: PublicKey
  /** Link to pool gauge record */
  poolGauge: PublicKey
  /** Amount of votes pledged to a gauge */
  votes: BN
}

export interface PersonalGaugeJSON {
  /** owner of personal gauge */
  owner: string
  /** Link to pool gauge record */
  poolGauge: string
  /** Amount of votes pledged to a gauge */
  votes: string
}

/** Account that tracks the number of votes on a given gauge for a specific user */
export class PersonalGauge {
  /** owner of personal gauge */
  readonly owner: PublicKey
  /** Link to pool gauge record */
  readonly poolGauge: PublicKey
  /** Amount of votes pledged to a gauge */
  readonly votes: BN

  static readonly discriminator = Buffer.from([
    164, 176, 49, 114, 107, 47, 171, 133,
  ])

  static readonly layout = borsh.struct([
    borsh.publicKey("owner"),
    borsh.publicKey("poolGauge"),
    borsh.u64("votes"),
  ])

  constructor(fields: PersonalGaugeFields) {
    this.owner = fields.owner
    this.poolGauge = fields.poolGauge
    this.votes = fields.votes
  }

  static async fetch(
    c: Connection,
    address: PublicKey,
    programId: PublicKey = PROGRAM_ID
  ): Promise<PersonalGauge | null> {
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
  ): Promise<Array<PersonalGauge | null>> {
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

  static decode(data: Buffer): PersonalGauge {
    if (!data.slice(0, 8).equals(PersonalGauge.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = PersonalGauge.layout.decode(data.slice(8))

    return new PersonalGauge({
      owner: dec.owner,
      poolGauge: dec.poolGauge,
      votes: dec.votes,
    })
  }

  toJSON(): PersonalGaugeJSON {
    return {
      owner: this.owner.toString(),
      poolGauge: this.poolGauge.toString(),
      votes: this.votes.toString(),
    }
  }

  static fromJSON(obj: PersonalGaugeJSON): PersonalGauge {
    return new PersonalGauge({
      owner: new PublicKey(obj.owner),
      poolGauge: new PublicKey(obj.poolGauge),
      votes: new BN(obj.votes),
    })
  }
}
