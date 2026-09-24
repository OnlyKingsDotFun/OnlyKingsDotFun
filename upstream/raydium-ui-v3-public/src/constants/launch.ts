/** Explicit release gate. Funding alone must never activate unsigned or undeployed programs. */
export const ONLYKINGS_LAUNCH = {
  live: false,
  targetSol: '17.06',
  fundingSource: 'OnlyKingsDotFun’s pump.fun creator fees',
  verifiedEarnedSol: null,
  programRent: [
    { name: 'Collection CPMM', sol: '4.79975164' },
    { name: 'Collection CLMM', sol: '9.17359100' },
    { name: 'Current gauge program', sol: '3.08580028' }
  ]
} as const
