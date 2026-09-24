import { PublicKey } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"

export interface RayStakeRewarderFields {
  /** Where the RAY is stored to be distributed */
  rayHopper: PublicKey
  /** Timestamp when last rewards were distributed */
  rewardedUntil: BN
  /** RAY per share index (Number) */
  shareIndex: BN
}

export interface RayStakeRewarderJSON {
  /** Where the RAY is stored to be distributed */
  rayHopper: string
  /** Timestamp when last rewards were distributed */
  rewardedUntil: string
  /** RAY per share index (Number) */
  shareIndex: string
}

/**
 * Rewarder struct for simple staking rewards
 * RAY is distributed by portion of RAY + isoRAY owned by a Reactor
 */
export class RayStakeRewarder {
  /** Where the RAY is stored to be distributed */
  readonly rayHopper: PublicKey
  /** Timestamp when last rewards were distributed */
  readonly rewardedUntil: BN
  /** RAY per share index (Number) */
  readonly shareIndex: BN

  constructor(fields: RayStakeRewarderFields) {
    this.rayHopper = fields.rayHopper
    this.rewardedUntil = fields.rewardedUntil
    this.shareIndex = fields.shareIndex
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.publicKey("rayHopper"),
        borsh.i64("rewardedUntil"),
        borsh.u128("shareIndex"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new RayStakeRewarder({
      rayHopper: obj.rayHopper,
      rewardedUntil: obj.rewardedUntil,
      shareIndex: obj.shareIndex,
    })
  }

  static toEncodable(fields: RayStakeRewarderFields) {
    return {
      rayHopper: fields.rayHopper,
      rewardedUntil: fields.rewardedUntil,
      shareIndex: fields.shareIndex,
    }
  }

  toJSON(): RayStakeRewarderJSON {
    return {
      rayHopper: this.rayHopper.toString(),
      rewardedUntil: this.rewardedUntil.toString(),
      shareIndex: this.shareIndex.toString(),
    }
  }

  static fromJSON(obj: RayStakeRewarderJSON): RayStakeRewarder {
    return new RayStakeRewarder({
      rayHopper: new PublicKey(obj.rayHopper),
      rewardedUntil: new BN(obj.rewardedUntil),
      shareIndex: new BN(obj.shareIndex),
    })
  }

  toEncodable() {
    return RayStakeRewarder.toEncodable(this)
  }
}
