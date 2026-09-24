import { web3 } from "@coral-xyz/anchor"
import { BankrunProvider } from "anchor-bankrun"
import { Clock, ProgramTestContext, startAnchor } from "solana-bankrun"
import fs from "fs"
import {
  MINT_SIZE,
  createAssociatedTokenAccountInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  AccountLayout as TokenAccountLayout,
  createTransferInstruction,
  MintLayout,
} from "@solana/spl-token"
import { TOKEN_PROGRAM_ID } from "@solana/spl-token"
import { CL_SWAP_PROGRAM_ID } from "./cl-util"
import { METADATA_PROGRAM_ID } from "@raydium-io/raydium-sdk-v2"
import { PublicKey } from "@solana/web3.js"

export function loadKey(fname: string) {
  const f = fs.readFileSync(fname, "utf8")
  const d: number[] = JSON.parse(f)
  const a = new Uint8Array(d)
  return web3.Keypair.fromSecretKey(a)
}

export async function bankrunPrelude() {
  const context = await startAnchor(
    "./",
    [
      {
        name: "raydium_cp_swap",
        programId: new web3.PublicKey("CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C"),
      },
      {
        name: "raydium_amm_v3",
        programId: CL_SWAP_PROGRAM_ID,
      },
      {
        name: "metaplex_metadata",
        programId: METADATA_PROGRAM_ID,
      },
    ],
    [
      {
        address: new PublicKey("4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R"),
        info: {
          executable: false,
          lamports: 343527427560,
          owner: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
          data: Uint8Array.from(
            Buffer.from(
              "AQAAAA2dsrcVq7LCAjY5jyBP5Us8MZuVZeqLqBoIkxL5pEATAbwszsT4AQAGAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
              "base64",
            ),
          ),
        },
      },
    ],
  )
  const provider = new BankrunProvider(context)
  const client = new BankrunClient(context, provider)
  MintLayout
  return {
    context,
    provider,
    client,
  }
}

export function accountExists({ client, address }: { client: BankrunClient; address: web3.PublicKey }) {
  return client
    .getConnection()
    .getAccountInfo(address)
    .then(() => true)
    .catch(() => false)
}

export async function createATA({
  client,
  owner,
  mint,
  tokenProgram,
}: {
  client: BankrunClient
  owner: web3.PublicKey
  mint: web3.PublicKey
  tokenProgram: web3.PublicKey
}) {
  const address = getAssociatedTokenAddressSync(mint, owner, false, tokenProgram)

  // prevent duplicate
  if (await accountExists({ client, address })) {
    return address
  }

  const ix = createAssociatedTokenAccountInstruction(client.getPayer().publicKey, address, owner, mint, tokenProgram)
  await signSendConfirm(client, [ix])

  return address
}

export async function mintTo({
  client,
  mint,
  dst,
  amount,
  authority,
  tokenProgram = TOKEN_PROGRAM_ID,
}: {
  client: BankrunClient
  mint: web3.PublicKey
  dst: web3.PublicKey
  amount: number
  authority: web3.Keypair
  tokenProgram?: web3.PublicKey
}) {
  const ix = createMintToInstruction(mint, dst, authority.publicKey, amount, [], tokenProgram)
  await signSendConfirm(client, [ix], authority)
}

export async function transferCoins({
  client,
  owner,
  src,
  dst,
  amt,
}: {
  client: BankrunClient
  owner: web3.Keypair
  src: web3.PublicKey
  dst: web3.PublicKey
  amt: number
}) {
  const ix = createTransferInstruction(src, dst, owner.publicKey, amt)
  await signSendConfirm(client, [ix], owner)
}

export async function getTokenBalance(client: BankrunClient, address: web3.PublicKey): Promise<bigint> {
  const account = await client.getConnection().getAccountInfo(address)
  if (!account) return 0n
  return TokenAccountLayout.decode(new Uint8Array(account.data)).amount
}

export async function createMint({
  client,
  mint,
  payer,
  authority,
  decimals,
  tokenProgram = TOKEN_PROGRAM_ID,
}: {
  client: BankrunClient
  mint: web3.Keypair
  payer: web3.Keypair
  authority: web3.PublicKey
  decimals: number
  tokenProgram?: web3.PublicKey
}) {
  const lamports = await client.getConnection().getMinimumBalanceForRentExemption(MINT_SIZE)
  const accIx = web3.SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    newAccountPubkey: mint.publicKey,
    space: MINT_SIZE,
    lamports,
    programId: tokenProgram,
  })
  const mintIx = createInitializeMint2Instruction(mint.publicKey, decimals, authority, authority, tokenProgram)
  await signSendConfirm(client, [accIx, mintIx], payer, [mint])
}

export async function initAdmin(client: BankrunClient) {
  return loadLocalKey("./tests/fixtures/reactor-admin-dev.json", client)
}

export async function loadLocalKey(name: string, client: BankrunClient) {
  const key = loadKey(name)
  await transferSOL(client, client.getPayer(), key.publicKey, 100e9)
  return key
}

export async function initUser(client: BankrunClient, sol = 100e9) {
  const user = web3.Keypair.generate()
  await transferSOL(client, client.getPayer(), user.publicKey, sol)
  return user
}

export class BankrunClient {
  constructor(private ctx: ProgramTestContext, private provider: BankrunProvider) {}

  sendTX(tx: web3.VersionedTransaction) {
    return this.ctx.banksClient.processTransaction(tx)
  }

  async setClock(now: number) {
    const clock = await this.ctx.banksClient.getClock()
    const newClock = new Clock(
      clock.slot,
      clock.epoch,
      clock.epochStartTimestamp,
      clock.leaderScheduleEpoch,
      BigInt(now),
    )
    this.provider.context.setClock(newClock)
  }

  async getNow() {
    const clock = await this.ctx.banksClient.getClock()
    return clock.unixTimestamp
  }

  async advanceClock(delta: number) {
    const now = await this.getNow()
    await this.setClock(Number(now) + delta)
  }

  async advanceSlot() {
    const slot = await this.ctx.banksClient.getSlot()
    this.ctx.warpToSlot(slot + 1n)
  }

  async getLatestBlockhash() {
    return this.ctx.lastBlockhash
  }

  async buildTX(instructions: web3.TransactionInstruction[], payer?: web3.PublicKey) {
    const payerKey = payer ? payer : this.getPayer().publicKey
    const msg = new web3.TransactionMessage({
      payerKey,
      recentBlockhash: await this.getLatestBlockhash(),
      instructions,
    }).compileToV0Message()

    return new web3.VersionedTransaction(msg)
  }

  getPayer() {
    return this.ctx.payer
  }

  getConnection() {
    return this.provider.connection
  }
}

export async function transferSOL(client: BankrunClient, owner: web3.Keypair, receiver: web3.PublicKey, amount = 1e9) {
  const ix = web3.SystemProgram.transfer({
    fromPubkey: owner.publicKey,
    toPubkey: receiver,
    lamports: amount,
  })
  await signSendConfirm(client, [ix], owner)
}

export async function signSendConfirm(
  client: BankrunClient,
  ixs: web3.TransactionInstruction[],
  // TODO - remove arg - not needed with bankrun
  payer?: web3.Keypair,
  signers: web3.Keypair[] = [],
) {
  const tx = await client.buildTX(ixs)
  // const signer = payer ? payer : client.getPayer()
  // tx.sign([signer])
  tx.sign(signers)
  await client.sendTX(tx)
}

function lexicographicalCompare(arr1: Uint8Array, arr2: Uint8Array): number {
  const l = Math.min(arr1.length, arr2.length)
  if (arr1.length !== arr2.length) {
    throw new Error("Arrays must have the same length")
  }

  for (let i = 0; i < l; i++) {
    if (arr1[i] < arr2[i]) {
      return -1 // arr1 is less than arr2
    } else if (arr1[i] > arr2[i]) {
      return 1 // arr1 is greater than arr2
    }
  }

  return 0 // The arrays are equal
}

export function getOrderedTokenMints() {
  const token0 = new web3.Keypair()

  while (true) {
    const token1 = new web3.Keypair()
    if (lexicographicalCompare(token0.publicKey.toBytes(), token1.publicKey.toBytes()) < 0) {
      return { token0, token1 }
    }
  }
}

/** Helper to format logs into a block */
export async function logBlock<T>(name: string, fn: () => Promise<T>) {
  logLine(`BEGIN ${name}`)
  const res = await fn()
  logLine(`END ${name}`)
  return res
}

export function logLine(text: string) {
  // add space padding to the text
  text = ` ${text} `
  // Determine the length of the text
  const textLength = text.length

  // Calculate the number of equal signs needed on each side
  const equalSignCount = Math.max(0, Math.floor((80 - textLength) / 2))

  // Create the string of equal signs
  const equalSigns = "=".repeat(equalSignCount)

  // Combine the equal signs, text, and equal signs
  const output = equalSigns + text + equalSigns

  // Print the output
  console.log("\n", output, "\n")
}
