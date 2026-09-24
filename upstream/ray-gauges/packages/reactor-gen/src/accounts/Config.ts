import { PublicKey, Connection } from "@solana/web3.js"
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface ConfigFields {
  /** Global tenant */
  tenant: PublicKey
  rayVault: PublicKey
  /** Mint for the RAY token */
  rayMint: PublicKey
  /** Authority for accounts that require signers */
  authority: PublicKey
  /** Signer seeds */
  signerAuthorityBump: Array<number>
  /** Is actually the address of the config account */
  signerAuthoritySeed: PublicKey
}

export interface ConfigJSON {
  /** Global tenant */
  tenant: string
  rayVault: string
  /** Mint for the RAY token */
  rayMint: string
  /** Authority for accounts that require signers */
  authority: string
  /** Signer seeds */
  signerAuthorityBump: Array<number>
  /** Is actually the address of the config account */
  signerAuthoritySeed: string
}

export class Config {
  /** Global tenant */
  readonly tenant: PublicKey
  readonly rayVault: PublicKey
  /** Mint for the RAY token */
  readonly rayMint: PublicKey
  /** Authority for accounts that require signers */
  readonly authority: PublicKey
  /** Signer seeds */
  readonly signerAuthorityBump: Array<number>
  /** Is actually the address of the config account */
  readonly signerAuthoritySeed: PublicKey

  static readonly discriminator = Buffer.from([
    155, 12, 170, 224, 30, 250, 204, 130,
  ])

  static readonly layout = borsh.struct([
    borsh.publicKey("tenant"),
    borsh.publicKey("rayVault"),
    borsh.publicKey("rayMint"),
    borsh.publicKey("authority"),
    borsh.array(borsh.u8(), 1, "signerAuthorityBump"),
    borsh.publicKey("signerAuthoritySeed"),
  ])

  constructor(fields: ConfigFields) {
    this.tenant = fields.tenant
    this.rayVault = fields.rayVault
    this.rayMint = fields.rayMint
    this.authority = fields.authority
    this.signerAuthorityBump = fields.signerAuthorityBump
    this.signerAuthoritySeed = fields.signerAuthoritySeed
  }

  static async fetch(
    c: Connection,
    address: PublicKey,
    programId: PublicKey = PROGRAM_ID
  ): Promise<Config | null> {
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
  ): Promise<Array<Config | null>> {
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

  static decode(data: Buffer): Config {
    if (!data.slice(0, 8).equals(Config.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = Config.layout.decode(data.slice(8))

    return new Config({
      tenant: dec.tenant,
      rayVault: dec.rayVault,
      rayMint: dec.rayMint,
      authority: dec.authority,
      signerAuthorityBump: dec.signerAuthorityBump,
      signerAuthoritySeed: dec.signerAuthoritySeed,
    })
  }

  toJSON(): ConfigJSON {
    return {
      tenant: this.tenant.toString(),
      rayVault: this.rayVault.toString(),
      rayMint: this.rayMint.toString(),
      authority: this.authority.toString(),
      signerAuthorityBump: this.signerAuthorityBump,
      signerAuthoritySeed: this.signerAuthoritySeed.toString(),
    }
  }

  static fromJSON(obj: ConfigJSON): Config {
    return new Config({
      tenant: new PublicKey(obj.tenant),
      rayVault: new PublicKey(obj.rayVault),
      rayMint: new PublicKey(obj.rayMint),
      authority: new PublicKey(obj.authority),
      signerAuthorityBump: obj.signerAuthorityBump,
      signerAuthoritySeed: new PublicKey(obj.signerAuthoritySeed),
    })
  }
}
