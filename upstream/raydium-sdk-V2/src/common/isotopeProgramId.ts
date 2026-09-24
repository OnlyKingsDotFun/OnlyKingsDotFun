import { PublicKey } from "@solana/web3.js";

/**
 * Isotope program registry. The forks of CP-Swap and CLMM carry the token-collection and
 * collection-pool instructions; mainnet ids are set at launch. Override with `setIsotopeProgramIds`.
 */
export interface IsotopeProgramIds {
  CPMM_PROGRAM: PublicKey;
  CLMM_PROGRAM: PublicKey;
  /** protocol admin (ruleset authority, config owner) */
  ADMIN: PublicKey;
}

export const ISOTOPE_TESTNET_PROGRAM_ID: IsotopeProgramIds = {
  CPMM_PROGRAM: new PublicKey("CY3u73vvVtGa5vojxDoKyg4cn7QWYRDzLTBN9jQKm5RH"),
  CLMM_PROGRAM: new PublicKey("7TZxYo5n2b1GPrPfVLyCuBKHP81y4w8H5AKEySgWQBnJ"),
  ADMIN: new PublicKey("tEST7VtgmRM2rLW5FS4tGRvsb2jpL1X4eJvVyDTtTWg"),
};

let current: IsotopeProgramIds = ISOTOPE_TESTNET_PROGRAM_ID;
export function setIsotopeProgramIds(ids: Partial<IsotopeProgramIds>): void {
  current = { ...current, ...ids };
}
export function getIsotopeProgramIds(): IsotopeProgramIds {
  return current;
}
