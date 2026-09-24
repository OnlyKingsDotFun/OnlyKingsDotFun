import { PublicKey } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"

export interface NumberRawFields {
  val: Array<BN>
}

export interface NumberRawJSON {
  val: Array<string>
}

export class NumberRaw {
  readonly val: Array<BN>

  constructor(fields: NumberRawFields) {
    this.val = fields.val
  }

  static layout(property?: string) {
    return borsh.struct([borsh.array(borsh.u64(), 4, "val")], property)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new NumberRaw({
      val: obj.val,
    })
  }

  static toEncodable(fields: NumberRawFields) {
    return {
      val: fields.val,
    }
  }

  toJSON(): NumberRawJSON {
    return {
      val: this.val.map((item) => item.toString()),
    }
  }

  static fromJSON(obj: NumberRawJSON): NumberRaw {
    return new NumberRaw({
      val: obj.val.map((item) => new BN(item)),
    })
  }

  toEncodable() {
    return NumberRaw.toEncodable(this)
  }
}
