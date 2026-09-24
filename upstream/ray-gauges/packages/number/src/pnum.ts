import BN from "bn.js"
import Decimal from "decimal.js"

export type PNumRaw = [BN, BN, BN, BN]
export const DECIMAL_PLACES = 12

export const ONE = 10 ** DECIMAL_PLACES

export class PreciseNumber {
  public value: PNumRaw
  public valueString: string

  constructor(val: string) {
    this.valueString = val
    this.value = stringToU256(val)
  }

  /** Serialize for Solana Anchor deserialization
   * The PreciseNumber type is a tuple struct `PreciseNumber([u64; 4])` in Rust
   */
  serialize() {
    return { 0: this.value }
  }

  anchorify() {
    return this.serialize()
  }

  static fromRaw(raw: BN[]): PreciseNumber {
    if (raw.length !== 4) {
      throw new Error("Invalid input: raw must be an array of 4 BNs")
    }
    const n = u256ToString(raw)
    return new PreciseNumber(n)
  }
}

export function stringToU256(str: string, decimalPlaces = DECIMAL_PLACES): PNumRaw {
  try {
    // 1. Parse as Decimal for precision
    const decimalValue = new Decimal(str)

    // 2. Scale to integer representation
    const scaledValue = decimalValue.times(new Decimal(10).pow(decimalPlaces))
    const integer = BigInt(scaledValue.round().toHexadecimal())
    const u64Words: BN[] = []
    for (let i = 0; i < 4; i++) {
      const word = (integer >> BigInt(i * 64)) & BigInt("0xFFFFFFFFFFFFFFFF")
      u64Words.push(new BN(word.toString()))
    }

    return u64Words as PNumRaw
  } catch (error) {
    throw new Error(`Invalid input: ${error}`)
  }
}

export function u256ToString(bnArray: BN[], decimalPlaces = DECIMAL_PLACES): string {
  if (bnArray.length !== 4) {
    throw new Error("Invalid input: bnArray must be an array of 4 BNs")
  }

  // join words
  const integer = bnArray[0].add(bnArray[1].shln(64)).add(bnArray[2].shln(128)).add(bnArray[3].shln(192))

  // 2. Convert BN to Decimal
  const decimalValue = new Decimal(integer.toString())

  // 3. Scale back to original fixed-point value
  const originalValue = decimalValue.div(new Decimal(10).pow(decimalPlaces))

  // 4. Return the string representation
  return originalValue.toString()
}
