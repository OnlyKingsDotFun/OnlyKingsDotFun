import { PublicKey, Connection } from "@solana/web3.js"
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface ReactorFields {
  owner: PublicKey
  /** Amount of RAY deposited */
  ray: BN
  /** How many votes are locked in gauge voting */
  lockedVotes: BN
  /** isoRAY balance */
  isoRay: BN
  /** Rewards from simple staking emissions */
  rayStakeRewards: types.RayStakeRewardsFields
  /** The last seen index for isoRAY accrual */
  lastSeenIndexIsoRay: types.NumberRawFields
}

export interface ReactorJSON {
  owner: string
  /** Amount of RAY deposited */
  ray: string
  /** How many votes are locked in gauge voting */
  lockedVotes: string
  /** isoRAY balance */
  isoRay: string
  /** Rewards from simple staking emissions */
  rayStakeRewards: types.RayStakeRewardsJSON
  /** The last seen index for isoRAY accrual */
  lastSeenIndexIsoRay: types.NumberRawJSON
}

export class Reactor {
  readonly owner: PublicKey
  /** Amount of RAY deposited */
  readonly ray: BN
  /** How many votes are locked in gauge voting */
  readonly lockedVotes: BN
  /** isoRAY balance */
  readonly isoRay: BN
  /** Rewards from simple staking emissions */
  readonly rayStakeRewards: types.RayStakeRewards
  /** The last seen index for isoRAY accrual */
  readonly lastSeenIndexIsoRay: types.NumberRaw

  static readonly discriminator = Buffer.from([23, 95, 9, 66, 41, 244, 37, 71])

  static readonly layout = borsh.struct([
    borsh.publicKey("owner"),
    borsh.u64("ray"),
    borsh.u64("lockedVotes"),
    borsh.u64("isoRay"),
    types.RayStakeRewards.layout("rayStakeRewards"),
    types.NumberRaw.layout("lastSeenIndexIsoRay"),
  ])

  constructor(fields: ReactorFields) {
    this.owner = fields.owner
    this.ray = fields.ray
    this.lockedVotes = fields.lockedVotes
    this.isoRay = fields.isoRay
    this.rayStakeRewards = new types.RayStakeRewards({
      ...fields.rayStakeRewards,
    })
    this.lastSeenIndexIsoRay = new types.NumberRaw({
      ...fields.lastSeenIndexIsoRay,
    })
  }

  static async fetch(
    c: Connection,
    address: PublicKey,
    programId: PublicKey = PROGRAM_ID
  ): Promise<Reactor | null> {
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
  ): Promise<Array<Reactor | null>> {
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

  static decode(data: Buffer): Reactor {
    if (!data.slice(0, 8).equals(Reactor.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = Reactor.layout.decode(data.slice(8))

    return new Reactor({
      owner: dec.owner,
      ray: dec.ray,
      lockedVotes: dec.lockedVotes,
      isoRay: dec.isoRay,
      rayStakeRewards: types.RayStakeRewards.fromDecoded(dec.rayStakeRewards),
      lastSeenIndexIsoRay: types.NumberRaw.fromDecoded(dec.lastSeenIndexIsoRay),
    })
  }

  toJSON(): ReactorJSON {
    return {
      owner: this.owner.toString(),
      ray: this.ray.toString(),
      lockedVotes: this.lockedVotes.toString(),
      isoRay: this.isoRay.toString(),
      rayStakeRewards: this.rayStakeRewards.toJSON(),
      lastSeenIndexIsoRay: this.lastSeenIndexIsoRay.toJSON(),
    }
  }

  static fromJSON(obj: ReactorJSON): Reactor {
    return new Reactor({
      owner: new PublicKey(obj.owner),
      ray: new BN(obj.ray),
      lockedVotes: new BN(obj.lockedVotes),
      isoRay: new BN(obj.isoRay),
      rayStakeRewards: types.RayStakeRewards.fromJSON(obj.rayStakeRewards),
      lastSeenIndexIsoRay: types.NumberRaw.fromJSON(obj.lastSeenIndexIsoRay),
    })
  }
}
