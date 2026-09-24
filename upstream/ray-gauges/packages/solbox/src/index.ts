import { web3 } from "@coral-xyz/anchor"
import { AccountLayout, MintLayout } from "@solana/spl-token"

export async function getMint(cnx: web3.Connection, mintAddress: web3.PublicKey) {
  const ai = await cnx.getAccountInfo(mintAddress)
  return MintLayout.decode(ai.data)
}

export async function getTokenAccountBalance(cnx: web3.Connection, address: web3.PublicKey): Promise<bigint> {
  const ai = await cnx.getAccountInfo(address)
  if (!ai) {
    return 0n
  }

  const a = AccountLayout.decode(ai.data)
  return a.amount
}
