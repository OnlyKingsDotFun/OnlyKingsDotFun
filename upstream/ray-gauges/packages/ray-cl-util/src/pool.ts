import { web3 } from "@coral-xyz/anchor";
import poolAccount from "./sol_usdc_pool_state.json";
import { gen } from "@raygauge/ray-cl-idl";
import { RayClPda } from "@raygauge/ray-cl-pda";

const pda = new RayClPda();

export function decode() {
  const address = new web3.PublicKey(poolAccount.pubkey);
  const d64 = poolAccount.account.data[0];
  const buffer = Buffer.from(d64, "base64");
  const pool = gen.accounts.PoolState.decode(buffer);

  return { buffer, pool, address };
}

function setPoolData({
  poolData,
  owner,
  ammConfig,
  observationKey,
}: {
  poolData: Buffer;
  owner: web3.PublicKey;
  ammConfig: web3.PublicKey;
  observationKey: web3.PublicKey;
}) {
  const ammConfigBuffer = ammConfig.toBuffer();
  const ownerBuffer = owner.toBuffer();
  //   const mint0Buffer = mint0.toBuffer();
  //   const mint1Buffer = mint1.toBuffer();
  const observationKeyBuffer = observationKey.toBuffer();

  //   const token0Vault = pda.poolVault({ pool: address, mint: mint0 });
  //   const token1Vault = pda.poolVault({ pool: address, mint: mint1 });

  //   const token0VaultBuffer = token0Vault.toBuffer();
  //   const token1VaultBuffer = token1Vault.toBuffer();

  const ammConfigStart = 8 + 1;
  const ownerStart = ammConfigStart + 32;
  const mint0Start = ownerStart + 32;
  const mint1Start = mint0Start + 32;
  const tokenVault0Start = mint1Start + 32;
  const tokenVault1Start = tokenVault0Start + 32;
  const observationKeyStart = tokenVault1Start + 32;

  ammConfigBuffer.copy(poolData, ammConfigStart);
  ownerBuffer.copy(poolData, ownerStart);
  //   mint0Buffer.copy(poolData, mint0Start);
  //   mint1Buffer.copy(poolData, mint1Start);
  //   token0VaultBuffer.copy(poolData, tokenVault0Start);
  //   token1VaultBuffer.copy(poolData, tokenVault1Start);
  observationKeyBuffer.copy(poolData, observationKeyStart);

  return poolData;
}

const { buffer, address } = decode();
setPoolData({
  poolData: buffer,
  owner: web3.PublicKey.default,
  ammConfig: web3.PublicKey.default,
  observationKey: web3.PublicKey.default,
});
