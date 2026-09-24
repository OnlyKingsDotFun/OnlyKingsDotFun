import { MessageV0, MessageV1, PublicKey, Signer, TransactionConfig, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";

/**
 * Transaction v1 (SIMD-0385) wire encoding. web3.js 1.99 deserializes v1 but does not serialize it, so the
 * SDK encodes the message itself and verifies the result round-trips through `MessageV1.deserialize`.
 *
 * Layout: 0x81 | header(3) | config mask u32 | blockhash(32) | instruction count u8 | static key count u8 |
 * static keys | [priority fee u64] [cu limit u32] [loaded data limit u32] [heap u32] |
 * instruction headers (program idx u8, n accounts u8, data len u16) | instruction bodies (account idxs, data).
 * Envelope: message bytes, then signatures appended with no length prefix (count = numRequiredSignatures).
 */
const MASK_PRIORITY_FEE = 0b00011;
const MASK_CU_LIMIT = 0b00100;
const MASK_LOADED_DATA = 0b01000;
const MASK_HEAP = 0b10000;
export const MAX_V1_TRANSACTION_BYTES = 4096;
export const MAX_V1_ACCOUNTS = 64;
export const MAX_V1_INSTRUCTIONS = 64;

const u32 = (v: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; };
const u64 = (v: number | bigint) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return b; };

export function serializeMessageV1(m: MessageV1): Uint8Array {
  const cfg = m.transactionConfig;
  let mask = 0;
  if (cfg.priorityFee !== null && cfg.priorityFee !== undefined) mask |= MASK_PRIORITY_FEE;
  if (cfg.computeUnitLimit !== null && cfg.computeUnitLimit !== undefined) mask |= MASK_CU_LIMIT;
  if (cfg.loadedAccountsDataSizeLimit !== null && cfg.loadedAccountsDataSizeLimit !== undefined) mask |= MASK_LOADED_DATA;
  if (cfg.heapSize !== null && cfg.heapSize !== undefined) mask |= MASK_HEAP;
  if (m.staticAccountKeys.length > MAX_V1_ACCOUNTS) throw new Error(`v1 transaction: ${m.staticAccountKeys.length} accounts > ${MAX_V1_ACCOUNTS}`);
  if (m.compiledInstructions.length > MAX_V1_INSTRUCTIONS) throw new Error(`v1 transaction: ${m.compiledInstructions.length} instructions > ${MAX_V1_INSTRUCTIONS}`);
  const parts: Buffer[] = [
    Buffer.from([0x81, m.header.numRequiredSignatures, m.header.numReadonlySignedAccounts, m.header.numReadonlyUnsignedAccounts]),
    u32(mask),
    Buffer.from(bs58.decode(m.recentBlockhash)),
    Buffer.from([m.compiledInstructions.length, m.staticAccountKeys.length]),
    ...m.staticAccountKeys.map((k) => k.toBuffer()),
  ];
  if (mask & MASK_PRIORITY_FEE) parts.push(u64(cfg.priorityFee!));
  if (mask & MASK_CU_LIMIT) parts.push(u32(cfg.computeUnitLimit!));
  if (mask & MASK_LOADED_DATA) parts.push(u32(cfg.loadedAccountsDataSizeLimit!));
  if (mask & MASK_HEAP) parts.push(u32(cfg.heapSize!));
  for (const ci of m.compiledInstructions) {
    if (ci.data.length > 0xffff) throw new Error("v1 instruction data too long");
    parts.push(Buffer.from([ci.programIdIndex, ci.accountKeyIndexes.length, ci.data.length & 0xff, ci.data.length >> 8]));
  }
  for (const ci of m.compiledInstructions) parts.push(Buffer.from(ci.accountKeyIndexes), Buffer.from(ci.data));
  const out = Buffer.concat(parts);
  // self-check against web3.js' reader so a layout drift fails loudly here, not at the RPC
  MessageV1.deserialize(out);
  return out;
}

/** A signed v1 transaction: message bytes followed by signatures (no length prefix). */
export class TransactionV1 {
  public readonly message: MessageV1;
  public signatures: Uint8Array[];
  public readonly version = 1 as const;
  constructor(message: MessageV1, signatures?: Uint8Array[]) {
    this.message = message;
    this.signatures = signatures ?? Array.from({ length: message.header.numRequiredSignatures }, () => new Uint8Array(64));
  }
  static fromV0(m0: MessageV0, transactionConfig: TransactionConfig): TransactionV1 {
    if (m0.addressTableLookups.length) throw new Error("v1 transactions have no address table lookups");
    return new TransactionV1(
      new MessageV1({ header: m0.header, staticAccountKeys: m0.staticAccountKeys, recentBlockhash: m0.recentBlockhash, compiledInstructions: m0.compiledInstructions, transactionConfig }),
    );
  }
  sign(signers: Signer[]): void {
    const msg = serializeMessageV1(this.message);
    const signerKeys = this.message.staticAccountKeys.slice(0, this.message.header.numRequiredSignatures);
    for (const s of signers) {
      const idx = signerKeys.findIndex((k) => k.equals(s.publicKey));
      if (idx < 0) throw new Error(`Cannot sign with non signer key ${s.publicKey.toBase58()}`);
      this.signatures[idx] = nacl.sign.detached(msg, s.secretKey);
    }
  }
  addSignature(publicKey: PublicKey, signature: Uint8Array): void {
    const idx = this.message.staticAccountKeys.findIndex((k) => k.equals(publicKey));
    if (idx < 0 || idx >= this.message.header.numRequiredSignatures) throw new Error("not a signer");
    this.signatures[idx] = signature;
  }
  serialize(): Uint8Array {
    const msg = serializeMessageV1(this.message);
    const out = Buffer.concat([Buffer.from(msg), ...this.signatures.map((s) => Buffer.from(s))]);
    if (out.length > MAX_V1_TRANSACTION_BYTES) throw new Error(`v1 transaction is ${out.length} bytes > ${MAX_V1_TRANSACTION_BYTES}`);
    return out;
  }
  /** web3.js can parse the envelope back, which is what wallets and RPC helpers operate on. */
  toVersionedTransaction(): VersionedTransaction {
    return VersionedTransaction.deserialize(this.serialize());
  }
}
