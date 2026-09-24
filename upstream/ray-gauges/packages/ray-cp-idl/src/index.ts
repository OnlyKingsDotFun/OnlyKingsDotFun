import { web3 } from "@coral-xyz/anchor"
import * as idl from "./raydium_cp_swap.json"
import { RaydiumCpSwap } from "./raydium_cp_swap"

export const CP_SWAP_PROGRAM_ID = new web3.PublicKey("CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C")

export const CP_SWAP_ADMIN_ID = new web3.PublicKey("33UrW4Ly4Q242osMjaCEVuMjWx24hZguGnCV6dkq1DUz")

export * from "./raydium_cp_swap"
export const IDL = idl as RaydiumCpSwap
