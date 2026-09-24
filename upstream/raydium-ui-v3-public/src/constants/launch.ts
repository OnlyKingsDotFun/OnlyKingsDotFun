/** Explicit release gate. Funding alone must never activate unsigned or undeployed programs. */
const tokenMint = 'W5R4szoWgR19hSJ7m4s1cW2sLHFGjcGYo41ePUVpump'

export const ONLYKINGS_LAUNCH = {
  live: false,
  tokenMint,
  pumpFunUrl: `https://pump.fun/coin/${tokenMint}`,
  targetSol: '17.06',
  fundingSource: 'OnlyKingsDotFun’s pump.fun creator fees',
  verifiedEarnedSol: null,
  programRent: [
    { name: 'Collection CPMM', sol: '4.79975164' },
    { name: 'Collection CLMM', sol: '9.17359100' },
    { name: 'Current gauge program', sol: '3.08580028' }
  ]
} as const
