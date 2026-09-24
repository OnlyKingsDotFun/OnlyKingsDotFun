import { PublicKey, Connection } from "@solana/web3.js"
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface ReactorConfigFields {
  /** Token account that holds deposited RAY tokens */
  rayVault: PublicKey
  /**
   * Total RAY staked in all Reactors
   * Tracked separately here to avoid the vulnerability of tokens being sent directly to the vault
   */
  totalRayDeposited: BN
  /** Mint for the RAY token */
  rayMint: PublicKey
  /** Last time rewards were emitted */
  rewardsEmittedUntil: BN
  /** RAY per day */
  rayRewardDailyEmission: BN
  /** Token account that holds RAY tokens for emission */
  rayRewardHopper: PublicKey
  /** Increasing share index of RAY rewards */
  rayRewardIndex: types.NumberRawFields
  /** APR for isoRAY */
  isoRayAprBps: number
  /** isoRAY time-unit index */
  isoRayIndex: types.NumberRawFields
  /** Bump seed for the PDA */
  bump: Array<number>
}

export interface ReactorConfigJSON {
  /** Token account that holds deposited RAY tokens */
  rayVault: string
  /**
   * Total RAY staked in all Reactors
   * Tracked separately here to avoid the vulnerability of tokens being sent directly to the vault
   */
  totalRayDeposited: string
  /** Mint for the RAY token */
  rayMint: string
  /** Last time rewards were emitted */
  rewardsEmittedUntil: string
  /** RAY per day */
  rayRewardDailyEmission: string
  /** Token account that holds RAY tokens for emission */
  rayRewardHopper: string
  /** Increasing share index of RAY rewards */
  rayRewardIndex: types.NumberRawJSON
  /** APR for isoRAY */
  isoRayAprBps: number
  /** isoRAY time-unit index */
  isoRayIndex: types.NumberRawJSON
  /** Bump seed for the PDA */
  bump: Array<number>
}

export class ReactorConfig {
  /** Token account that holds deposited RAY tokens */
  readonly rayVault: PublicKey
  /**
   * Total RAY staked in all Reactors
   * Tracked separately here to avoid the vulnerability of tokens being sent directly to the vault
   */
  readonly totalRayDeposited: BN
  /** Mint for the RAY token */
  readonly rayMint: PublicKey
  /** Last time rewards were emitted */
  readonly rewardsEmittedUntil: BN
  /** RAY per day */
  readonly rayRewardDailyEmission: BN
  /** Token account that holds RAY tokens for emission */
  readonly rayRewardHopper: PublicKey
  /** Increasing share index of RAY rewards */
  readonly rayRewardIndex: types.NumberRaw
  /** APR for isoRAY */
  readonly isoRayAprBps: number
  /** isoRAY time-unit index */
  readonly isoRayIndex: types.NumberRaw
  /** Bump seed for the PDA */
  readonly bump: Array<number>

  static readonly discriminator = Buffer.from([
    45, 60, 88, 98, 145, 54, 88, 171,
  ])

  static readonly layout = borsh.struct([
    borsh.publicKey("rayVault"),
    borsh.u64("totalRayDeposited"),
    borsh.publicKey("rayMint"),
    borsh.u64("rewardsEmittedUntil"),
    borsh.u64("rayRewardDailyEmission"),
    borsh.publicKey("rayRewardHopper"),
    types.NumberRaw.layout("rayRewardIndex"),
    borsh.u16("isoRayAprBps"),
    types.NumberRaw.layout("isoRayIndex"),
    borsh.array(borsh.u8(), 1, "bump"),
  ])

  constructor(fields: ReactorConfigFields) {
    this.rayVault = fields.rayVault
    this.totalRayDeposited = fields.totalRayDeposited
    this.rayMint = fields.rayMint
    this.rewardsEmittedUntil = fields.rewardsEmittedUntil
    this.rayRewardDailyEmission = fields.rayRewardDailyEmission
    this.rayRewardHopper = fields.rayRewardHopper
    this.rayRewardIndex = new types.NumberRaw({ ...fields.rayRewardIndex })
    this.isoRayAprBps = fields.isoRayAprBps
    this.isoRayIndex = new types.NumberRaw({ ...fields.isoRayIndex })
    this.bump = fields.bump
  }

  static async fetch(
    c: Connection,
    address: PublicKey,
    programId: PublicKey = PROGRAM_ID
  ): Promise<ReactorConfig | null> {
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
  ): Promise<Array<ReactorConfig | null>> {
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

  static decode(data: Buffer): ReactorConfig {
    if (!data.slice(0, 8).equals(ReactorConfig.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = ReactorConfig.layout.decode(data.slice(8))

    return new ReactorConfig({
      rayVault: dec.rayVault,
      totalRayDeposited: dec.totalRayDeposited,
      rayMint: dec.rayMint,
      rewardsEmittedUntil: dec.rewardsEmittedUntil,
      rayRewardDailyEmission: dec.rayRewardDailyEmission,
      rayRewardHopper: dec.rayRewardHopper,
      rayRewardIndex: types.NumberRaw.fromDecoded(dec.rayRewardIndex),
      isoRayAprBps: dec.isoRayAprBps,
      isoRayIndex: types.NumberRaw.fromDecoded(dec.isoRayIndex),
      bump: dec.bump,
    })
  }

  toJSON(): ReactorConfigJSON {
    return {
      rayVault: this.rayVault.toString(),
      totalRayDeposited: this.totalRayDeposited.toString(),
      rayMint: this.rayMint.toString(),
      rewardsEmittedUntil: this.rewardsEmittedUntil.toString(),
      rayRewardDailyEmission: this.rayRewardDailyEmission.toString(),
      rayRewardHopper: this.rayRewardHopper.toString(),
      rayRewardIndex: this.rayRewardIndex.toJSON(),
      isoRayAprBps: this.isoRayAprBps,
      isoRayIndex: this.isoRayIndex.toJSON(),
      bump: this.bump,
    }
  }

  static fromJSON(obj: ReactorConfigJSON): ReactorConfig {
    return new ReactorConfig({
      rayVault: new PublicKey(obj.rayVault),
      totalRayDeposited: new BN(obj.totalRayDeposited),
      rayMint: new PublicKey(obj.rayMint),
      rewardsEmittedUntil: new BN(obj.rewardsEmittedUntil),
      rayRewardDailyEmission: new BN(obj.rayRewardDailyEmission),
      rayRewardHopper: new PublicKey(obj.rayRewardHopper),
      rayRewardIndex: types.NumberRaw.fromJSON(obj.rayRewardIndex),
      isoRayAprBps: obj.isoRayAprBps,
      isoRayIndex: types.NumberRaw.fromJSON(obj.isoRayIndex),
      bump: obj.bump,
    })
  }
}
