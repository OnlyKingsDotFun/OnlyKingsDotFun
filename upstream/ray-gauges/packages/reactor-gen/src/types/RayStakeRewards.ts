import { PublicKey } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"

export interface RayStakeRewardsFields {
  /** Last seen global index */
  lastSeenIndex: types.NumberRawFields
  /** RAY rewards from simple staking */
  uncollectedRayReward: BN
}

export interface RayStakeRewardsJSON {
  /** Last seen global index */
  lastSeenIndex: types.NumberRawJSON
  /** RAY rewards from simple staking */
  uncollectedRayReward: string
}

export class RayStakeRewards {
  /** Last seen global index */
  readonly lastSeenIndex: types.NumberRaw
  /** RAY rewards from simple staking */
  readonly uncollectedRayReward: BN

  constructor(fields: RayStakeRewardsFields) {
    this.lastSeenIndex = new types.NumberRaw({ ...fields.lastSeenIndex })
    this.uncollectedRayReward = fields.uncollectedRayReward
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        types.NumberRaw.layout("lastSeenIndex"),
        borsh.u64("uncollectedRayReward"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new RayStakeRewards({
      lastSeenIndex: types.NumberRaw.fromDecoded(obj.lastSeenIndex),
      uncollectedRayReward: obj.uncollectedRayReward,
    })
  }

  static toEncodable(fields: RayStakeRewardsFields) {
    return {
      lastSeenIndex: types.NumberRaw.toEncodable(fields.lastSeenIndex),
      uncollectedRayReward: fields.uncollectedRayReward,
    }
  }

  toJSON(): RayStakeRewardsJSON {
    return {
      lastSeenIndex: this.lastSeenIndex.toJSON(),
      uncollectedRayReward: this.uncollectedRayReward.toString(),
    }
  }

  static fromJSON(obj: RayStakeRewardsJSON): RayStakeRewards {
    return new RayStakeRewards({
      lastSeenIndex: types.NumberRaw.fromJSON(obj.lastSeenIndex),
      uncollectedRayReward: new BN(obj.uncollectedRayReward),
    })
  }

  toEncodable() {
    return RayStakeRewards.toEncodable(this)
  }
}
