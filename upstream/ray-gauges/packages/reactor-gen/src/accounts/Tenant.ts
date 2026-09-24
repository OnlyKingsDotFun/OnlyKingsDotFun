import { PublicKey, Connection } from "@solana/web3.js"
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface TenantFields {
  /** Annual rate of accrual for isoRAY */
  isoRayAprBps: number
  rayVault: PublicKey
  /** Owner of the token vault */
  authority: PublicKey
  /** Signer seeds */
  signerAuthorityBump: Array<number>
  signerAuthoritySeed: PublicKey
  /** Mint for the RAY token */
  rayMint: PublicKey
}

export interface TenantJSON {
  /** Annual rate of accrual for isoRAY */
  isoRayAprBps: number
  rayVault: string
  /** Owner of the token vault */
  authority: string
  /** Signer seeds */
  signerAuthorityBump: Array<number>
  signerAuthoritySeed: string
  /** Mint for the RAY token */
  rayMint: string
}

export class Tenant {
  /** Annual rate of accrual for isoRAY */
  readonly isoRayAprBps: number
  readonly rayVault: PublicKey
  /** Owner of the token vault */
  readonly authority: PublicKey
  /** Signer seeds */
  readonly signerAuthorityBump: Array<number>
  readonly signerAuthoritySeed: PublicKey
  /** Mint for the RAY token */
  readonly rayMint: PublicKey

  static readonly discriminator = Buffer.from([
    61, 43, 215, 51, 232, 242, 209, 170,
  ])

  static readonly layout = borsh.struct([
    borsh.u16("isoRayAprBps"),
    borsh.publicKey("rayVault"),
    borsh.publicKey("authority"),
    borsh.array(borsh.u8(), 1, "signerAuthorityBump"),
    borsh.publicKey("signerAuthoritySeed"),
    borsh.publicKey("rayMint"),
  ])

  constructor(fields: TenantFields) {
    this.isoRayAprBps = fields.isoRayAprBps
    this.rayVault = fields.rayVault
    this.authority = fields.authority
    this.signerAuthorityBump = fields.signerAuthorityBump
    this.signerAuthoritySeed = fields.signerAuthoritySeed
    this.rayMint = fields.rayMint
  }

  static async fetch(
    c: Connection,
    address: PublicKey,
    programId: PublicKey = PROGRAM_ID
  ): Promise<Tenant | null> {
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
  ): Promise<Array<Tenant | null>> {
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

  static decode(data: Buffer): Tenant {
    if (!data.slice(0, 8).equals(Tenant.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = Tenant.layout.decode(data.slice(8))

    return new Tenant({
      isoRayAprBps: dec.isoRayAprBps,
      rayVault: dec.rayVault,
      authority: dec.authority,
      signerAuthorityBump: dec.signerAuthorityBump,
      signerAuthoritySeed: dec.signerAuthoritySeed,
      rayMint: dec.rayMint,
    })
  }

  toJSON(): TenantJSON {
    return {
      isoRayAprBps: this.isoRayAprBps,
      rayVault: this.rayVault.toString(),
      authority: this.authority.toString(),
      signerAuthorityBump: this.signerAuthorityBump,
      signerAuthoritySeed: this.signerAuthoritySeed.toString(),
      rayMint: this.rayMint.toString(),
    }
  }

  static fromJSON(obj: TenantJSON): Tenant {
    return new Tenant({
      isoRayAprBps: obj.isoRayAprBps,
      rayVault: new PublicKey(obj.rayVault),
      authority: new PublicKey(obj.authority),
      signerAuthorityBump: obj.signerAuthorityBump,
      signerAuthoritySeed: new PublicKey(obj.signerAuthoritySeed),
      rayMint: new PublicKey(obj.rayMint),
    })
  }
}
