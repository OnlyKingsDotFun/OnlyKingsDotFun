import { PublicKey, Connection } from "@solana/web3.js"
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface PersonalRewarderCpFields {
  /** owner address */
  owner: PublicKey
  /** Link to pool gauge record */
  poolGauge: PublicKey
  rewarder: types.PersonalRewarderStateFields
}

export interface PersonalRewarderCpJSON {
  /** owner address */
  owner: string
  /** Link to pool gauge record */
  poolGauge: string
  rewarder: types.PersonalRewarderStateJSON
}

/**
 * PersonalRewarderCp represents a personal rewarder for a Constant Product LP token account
 * This earns the RAY from the pool_gauge, and distributes it to the owner
 */
export class PersonalRewarderCp {
  /** owner address */
  readonly owner: PublicKey
  /** Link to pool gauge record */
  readonly poolGauge: PublicKey
  readonly rewarder: types.PersonalRewarderState

  static readonly discriminator = Buffer.from([
    59, 80, 89, 249, 195, 236, 80, 7,
  ])

  static readonly layout = borsh.struct([
    borsh.publicKey("owner"),
    borsh.publicKey("poolGauge"),
    types.PersonalRewarderState.layout("rewarder"),
  ])

  constructor(fields: PersonalRewarderCpFields) {
    this.owner = fields.owner
    this.poolGauge = fields.poolGauge
    this.rewarder = new types.PersonalRewarderState({ ...fields.rewarder })
  }

  static async fetch(
    c: Connection,
    address: PublicKey,
    programId: PublicKey = PROGRAM_ID
  ): Promise<PersonalRewarderCp | null> {
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
  ): Promise<Array<PersonalRewarderCp | null>> {
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

  static decode(data: Buffer): PersonalRewarderCp {
    if (!data.slice(0, 8).equals(PersonalRewarderCp.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = PersonalRewarderCp.layout.decode(data.slice(8))

    return new PersonalRewarderCp({
      owner: dec.owner,
      poolGauge: dec.poolGauge,
      rewarder: types.PersonalRewarderState.fromDecoded(dec.rewarder),
    })
  }

  toJSON(): PersonalRewarderCpJSON {
    return {
      owner: this.owner.toString(),
      poolGauge: this.poolGauge.toString(),
      rewarder: this.rewarder.toJSON(),
    }
  }

  static fromJSON(obj: PersonalRewarderCpJSON): PersonalRewarderCp {
    return new PersonalRewarderCp({
      owner: new PublicKey(obj.owner),
      poolGauge: new PublicKey(obj.poolGauge),
      rewarder: types.PersonalRewarderState.fromJSON(obj.rewarder),
    })
  }
}
