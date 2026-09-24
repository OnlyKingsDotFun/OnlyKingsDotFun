import { web3 } from "@coral-xyz/anchor"
import { CL_SWAP_PROGRAM_ID } from "@raygauge/ray-cl-idl"

export class RayClPda {
  constructor(public programId = CL_SWAP_PROGRAM_ID) {}

  private programAddress(seeds: (Buffer | Uint8Array)[]): web3.PublicKey {
    return web3.PublicKey.findProgramAddressSync(seeds, this.programId)[0]
  }

  ammConfig({ index }: { index: number }) {
    return this.programAddress([Buffer.from("amm_config"), numberToU16BufferBigEndian(index)])
  }
  operation() {
    return this.programAddress([Buffer.from("operation")])
  }

  observation({ pool }: { pool: web3.PublicKey }) {
    return this.programAddress([Buffer.from("observation"), pool.toBuffer()])
  }

  pool({ index, mint0, mint1 }: { index: number; mint0: web3.PublicKey; mint1: web3.PublicKey }) {
    return this.programAddress([
      Buffer.from("pool"),
      this.ammConfig({ index }).toBuffer(),
      mint0.toBuffer(),
      mint1.toBuffer(),
    ])
  }

  poolVault({ pool, mint }: { pool: web3.PublicKey; mint: web3.PublicKey }) {
    return this.programAddress([Buffer.from("pool_vault"), pool.toBuffer(), mint.toBuffer()])
  }

  tickArrayBitmap({ pool }: { pool: web3.PublicKey }) {
    return this.programAddress([Buffer.from("pool_tick_array_bitmap_extension"), pool.toBuffer()])
  }

  protocolPosition({ pool, tickLo, tickHi }: { pool: web3.PublicKey; tickLo: number; tickHi: number }) {
    return this.programAddress([
      Buffer.from("position"),
      pool.toBuffer(),
      numberToI32BufferBigEndian(tickLo),
      numberToI32BufferBigEndian(tickHi),
    ])
  }

  tickArrayAccount({ pool, index }: { pool: web3.PublicKey; index: number }) {
    return this.programAddress([Buffer.from("tick_array"), pool.toBuffer(), numberToI32BufferBigEndian(index)])
  }

  personalPosition({ nftMint }: { nftMint: web3.PublicKey }) {
    return this.programAddress([Buffer.from("position"), nftMint.toBuffer()])
  }

  /** Vault that holds reward tokens for a pool */
  rewardVault({ pool, mint }: { pool: web3.PublicKey; mint: web3.PublicKey }) {
    return this.programAddress([Buffer.from("pool_reward_vault"), pool.toBuffer(), mint.toBuffer()])
  }
}

function numberToU16BufferBigEndian(num: number): Uint8Array {
  // Create an ArrayBuffer of 2 bytes
  let buffer = new ArrayBuffer(2)

  // Create a DataView for the buffer
  let view = new DataView(buffer)

  // Set the number as a u16 value in big-endian order
  view.setUint16(0, num, false) // false for big-endian

  return new Uint8Array(buffer)
}

function numberToI32BufferBigEndian(num: number): Uint8Array {
  // Create an ArrayBuffer of 2 bytes
  let buffer = new ArrayBuffer(4)

  // Create a DataView for the buffer
  let view = new DataView(buffer)

  // Set the number as a u32 value in big-endian order
  view.setInt32(0, num, false) // false for big-endian

  return new Uint8Array(buffer)
}
