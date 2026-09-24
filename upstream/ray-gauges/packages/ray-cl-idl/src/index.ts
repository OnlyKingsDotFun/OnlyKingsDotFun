import { web3 } from "@coral-xyz/anchor"
import * as idl from "./amm_v3.json"
import { AmmV3 } from "./amm_v3"

export const CL_SWAP_PROGRAM_ID = new web3.PublicKey("CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK")

export * from "./amm_v3"
export const IDL = idl as AmmV3
export * as gen from "./gen"
export { instructions } from "./gen"
export { accounts } from "./gen"
