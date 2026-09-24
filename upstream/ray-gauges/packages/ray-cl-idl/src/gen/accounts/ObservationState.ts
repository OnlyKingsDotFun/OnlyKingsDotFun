import { PublicKey, Connection } from "@solana/web3.js"
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface ObservationStateFields {
  /** Whether the ObservationState is initialized */
  initialized: boolean
  /** recent update epoch */
  recentEpoch: BN
  /** the most-recently updated index of the observations array */
  observationIndex: number
  /** belongs to which pool */
  poolId: PublicKey
  /** observation array */
  observations: Array<types.ObservationFields>
  /** padding for feature update */
  padding: Array<BN>
}

export interface ObservationStateJSON {
  /** Whether the ObservationState is initialized */
  initialized: boolean
  /** recent update epoch */
  recentEpoch: string
  /** the most-recently updated index of the observations array */
  observationIndex: number
  /** belongs to which pool */
  poolId: string
  /** observation array */
  observations: Array<types.ObservationJSON>
  /** padding for feature update */
  padding: Array<string>
}

export class ObservationState {
  /** Whether the ObservationState is initialized */
  readonly initialized: boolean
  /** recent update epoch */
  readonly recentEpoch: BN
  /** the most-recently updated index of the observations array */
  readonly observationIndex: number
  /** belongs to which pool */
  readonly poolId: PublicKey
  /** observation array */
  readonly observations: Array<types.Observation>
  /** padding for feature update */
  readonly padding: Array<BN>

  static readonly discriminator = Buffer.from([
    122, 174, 197, 53, 129, 9, 165, 132,
  ])

  static readonly layout = borsh.struct([
    borsh.bool("initialized"),
    borsh.u64("recentEpoch"),
    borsh.u16("observationIndex"),
    borsh.publicKey("poolId"),
    borsh.array(types.Observation.layout(), 100, "observations"),
    borsh.array(borsh.u64(), 4, "padding"),
  ])

  constructor(fields: ObservationStateFields) {
    this.initialized = fields.initialized
    this.recentEpoch = fields.recentEpoch
    this.observationIndex = fields.observationIndex
    this.poolId = fields.poolId
    this.observations = fields.observations.map(
      (item) => new types.Observation({ ...item })
    )
    this.padding = fields.padding
  }

  static async fetch(
    c: Connection,
    address: PublicKey,
    programId: PublicKey = PROGRAM_ID
  ): Promise<ObservationState | null> {
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
  ): Promise<Array<ObservationState | null>> {
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

  static decode(data: Buffer): ObservationState {
    if (!data.slice(0, 8).equals(ObservationState.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = ObservationState.layout.decode(data.slice(8))

    return new ObservationState({
      initialized: dec.initialized,
      recentEpoch: dec.recentEpoch,
      observationIndex: dec.observationIndex,
      poolId: dec.poolId,
      observations: dec.observations.map(
        (
          item: any /* eslint-disable-line @typescript-eslint/no-explicit-any */
        ) => types.Observation.fromDecoded(item)
      ),
      padding: dec.padding,
    })
  }

  toJSON(): ObservationStateJSON {
    return {
      initialized: this.initialized,
      recentEpoch: this.recentEpoch.toString(),
      observationIndex: this.observationIndex,
      poolId: this.poolId.toString(),
      observations: this.observations.map((item) => item.toJSON()),
      padding: this.padding.map((item) => item.toString()),
    }
  }

  static fromJSON(obj: ObservationStateJSON): ObservationState {
    return new ObservationState({
      initialized: obj.initialized,
      recentEpoch: new BN(obj.recentEpoch),
      observationIndex: obj.observationIndex,
      poolId: new PublicKey(obj.poolId),
      observations: obj.observations.map((item) =>
        types.Observation.fromJSON(item)
      ),
      padding: obj.padding.map((item) => new BN(item)),
    })
  }
}
