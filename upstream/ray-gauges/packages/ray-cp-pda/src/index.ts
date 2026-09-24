import { utils, web3 } from "@coral-xyz/anchor"
import { CP_SWAP_PROGRAM_ID } from "@raygauge/ray-cp-idl"

const AMM_CONFIG_SEED = Buffer.from(utils.bytes.utf8.encode("amm_config"))
const POOL_SEED = Buffer.from(utils.bytes.utf8.encode("pool"))
const POOL_VAULT_SEED = Buffer.from(utils.bytes.utf8.encode("pool_vault"))
const POOL_AUTH_SEED = Buffer.from(utils.bytes.utf8.encode("vault_and_lp_mint_auth_seed"))
const POOL_LPMINT_SEED = Buffer.from(utils.bytes.utf8.encode("pool_lp_mint"))
const POOL_OBSERVATION_SEED = Buffer.from(utils.bytes.utf8.encode("observation"))
export class RayCpPda {
  constructor(public programId = new web3.PublicKey(CP_SWAP_PROGRAM_ID)) {}

  private programAddress(seeds: (Buffer | Uint8Array)[]): web3.PublicKey {
    return web3.PublicKey.findProgramAddressSync(seeds, this.programId)[0]
  }

  get auth() {
    return this.programAddress([POOL_AUTH_SEED])
  }

  ammConfig({ index }: { index: number }) {
    return this.programAddress([AMM_CONFIG_SEED, u16ToBytes(index)])
  }

  pool({ index, mint0, mint1 }: { index: number; mint0: web3.PublicKey; mint1: web3.PublicKey }) {
    return this.programAddress([POOL_SEED, this.ammConfig({ index }).toBuffer(), mint0.toBuffer(), mint1.toBuffer()])
  }

  poolValut({ pool, mint }: { pool: web3.PublicKey; mint: web3.PublicKey }) {
    return this.programAddress([POOL_VAULT_SEED, pool.toBuffer(), mint.toBuffer()])
  }

  poolLpMint({ pool }: { pool: web3.PublicKey }) {
    return this.programAddress([POOL_LPMINT_SEED, pool.toBuffer()])
  }

  poolObservation({ pool }: { pool: web3.PublicKey }) {
    return this.programAddress([POOL_OBSERVATION_SEED, pool.toBuffer()])
  }
}

function u16ToBytes(num: number) {
  const arr = new ArrayBuffer(2)
  const view = new DataView(arr)
  view.setUint16(0, num, false)
  return new Uint8Array(arr)
}
