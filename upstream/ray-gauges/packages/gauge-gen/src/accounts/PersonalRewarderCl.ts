import { PublicKey, Connection } from "@solana/web3.js"
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface PersonalRewarderClFields {
  /** link to the clmm PersonalPositionState record, which is 1:1 with the clmm NFT mint */
  poolPosition: PublicKey
  /** link to the pool gauge */
  poolGauge: PublicKey
  /**
   * link to the clmm pool
   * this might not be needed, since the pool_position should find it
   */
  pool: PublicKey
  rewarder: types.PersonalRewarderStateFields
}

export interface PersonalRewarderClJSON {
  /** link to the clmm PersonalPositionState record, which is 1:1 with the clmm NFT mint */
  poolPosition: string
  /** link to the pool gauge */
  poolGauge: string
  /**
   * link to the clmm pool
   * this might not be needed, since the pool_position should find it
   */
  pool: string
  rewarder: types.PersonalRewarderStateJSON
}

/**
 * PersonalRewarderCl represents a personal rewarder for a clmm position
 * This earns the RAY from the pool_gauge, and distributes it to the owner
 */
export class PersonalRewarderCl {
  /** link to the clmm PersonalPositionState record, which is 1:1 with the clmm NFT mint */
  readonly poolPosition: PublicKey
  /** link to the pool gauge */
  readonly poolGauge: PublicKey
  /**
   * link to the clmm pool
   * this might not be needed, since the pool_position should find it
   */
  readonly pool: PublicKey
  readonly rewarder: types.PersonalRewarderState

  static readonly discriminator = Buffer.from([
    91, 158, 174, 33, 142, 213, 198, 151,
  ])

  static readonly layout = borsh.struct([
    borsh.publicKey("poolPosition"),
    borsh.publicKey("poolGauge"),
    borsh.publicKey("pool"),
    types.PersonalRewarderState.layout("rewarder"),
  ])

  constructor(fields: PersonalRewarderClFields) {
    this.poolPosition = fields.poolPosition
    this.poolGauge = fields.poolGauge
    this.pool = fields.pool
    this.rewarder = new types.PersonalRewarderState({ ...fields.rewarder })
  }

  static async fetch(
    c: Connection,
    address: PublicKey,
    programId: PublicKey = PROGRAM_ID
  ): Promise<PersonalRewarderCl | null> {
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
  ): Promise<Array<PersonalRewarderCl | null>> {
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

  static decode(data: Buffer): PersonalRewarderCl {
    if (!data.slice(0, 8).equals(PersonalRewarderCl.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = PersonalRewarderCl.layout.decode(data.slice(8))

    return new PersonalRewarderCl({
      poolPosition: dec.poolPosition,
      poolGauge: dec.poolGauge,
      pool: dec.pool,
      rewarder: types.PersonalRewarderState.fromDecoded(dec.rewarder),
    })
  }

  toJSON(): PersonalRewarderClJSON {
    return {
      poolPosition: this.poolPosition.toString(),
      poolGauge: this.poolGauge.toString(),
      pool: this.pool.toString(),
      rewarder: this.rewarder.toJSON(),
    }
  }

  static fromJSON(obj: PersonalRewarderClJSON): PersonalRewarderCl {
    return new PersonalRewarderCl({
      poolPosition: new PublicKey(obj.poolPosition),
      poolGauge: new PublicKey(obj.poolGauge),
      pool: new PublicKey(obj.pool),
      rewarder: types.PersonalRewarderState.fromJSON(obj.rewarder),
    })
  }
}
