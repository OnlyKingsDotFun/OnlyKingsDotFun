import { PublicKey, Connection } from "@solana/web3.js"
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface TickArrayStateFields {
  poolId: PublicKey
  startTickIndex: number
  ticks: Array<types.TickStateFields>
  initializedTickCount: number
  recentEpoch: BN
  padding: Array<number>
}

export interface TickArrayStateJSON {
  poolId: string
  startTickIndex: number
  ticks: Array<types.TickStateJSON>
  initializedTickCount: number
  recentEpoch: string
  padding: Array<number>
}

export class TickArrayState {
  readonly poolId: PublicKey
  readonly startTickIndex: number
  readonly ticks: Array<types.TickState>
  readonly initializedTickCount: number
  readonly recentEpoch: BN
  readonly padding: Array<number>

  static readonly discriminator = Buffer.from([
    192, 155, 85, 205, 49, 249, 129, 42,
  ])

  static readonly layout = borsh.struct([
    borsh.publicKey("poolId"),
    borsh.i32("startTickIndex"),
    borsh.array(types.TickState.layout(), 60, "ticks"),
    borsh.u8("initializedTickCount"),
    borsh.u64("recentEpoch"),
    borsh.array(borsh.u8(), 107, "padding"),
  ])

  constructor(fields: TickArrayStateFields) {
    this.poolId = fields.poolId
    this.startTickIndex = fields.startTickIndex
    this.ticks = fields.ticks.map((item) => new types.TickState({ ...item }))
    this.initializedTickCount = fields.initializedTickCount
    this.recentEpoch = fields.recentEpoch
    this.padding = fields.padding
  }

  static async fetch(
    c: Connection,
    address: PublicKey,
    programId: PublicKey = PROGRAM_ID
  ): Promise<TickArrayState | null> {
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
  ): Promise<Array<TickArrayState | null>> {
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

  static decode(data: Buffer): TickArrayState {
    if (!data.slice(0, 8).equals(TickArrayState.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = TickArrayState.layout.decode(data.slice(8))

    return new TickArrayState({
      poolId: dec.poolId,
      startTickIndex: dec.startTickIndex,
      ticks: dec.ticks.map(
        (
          item: any /* eslint-disable-line @typescript-eslint/no-explicit-any */
        ) => types.TickState.fromDecoded(item)
      ),
      initializedTickCount: dec.initializedTickCount,
      recentEpoch: dec.recentEpoch,
      padding: dec.padding,
    })
  }

  toJSON(): TickArrayStateJSON {
    return {
      poolId: this.poolId.toString(),
      startTickIndex: this.startTickIndex,
      ticks: this.ticks.map((item) => item.toJSON()),
      initializedTickCount: this.initializedTickCount,
      recentEpoch: this.recentEpoch.toString(),
      padding: this.padding,
    }
  }

  static fromJSON(obj: TickArrayStateJSON): TickArrayState {
    return new TickArrayState({
      poolId: new PublicKey(obj.poolId),
      startTickIndex: obj.startTickIndex,
      ticks: obj.ticks.map((item) => types.TickState.fromJSON(item)),
      initializedTickCount: obj.initializedTickCount,
      recentEpoch: new BN(obj.recentEpoch),
      padding: obj.padding,
    })
  }
}
