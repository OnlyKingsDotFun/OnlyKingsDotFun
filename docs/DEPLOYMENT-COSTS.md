# Mainnet deployment rent

Measured from the existing local deploy binaries and mainnet
`getMinimumBalanceForRentExemption` on 2026-09-24 UTC. This quotes the binaries
identified below, not a promise that they match a future rebuild.

| Program | ELF bytes | Program + ProgramData rent (SOL) |
| --- | ---: | ---: |
| Collection CPMM | 944,496 | 4.79975164 |
| Collection CLMM | 1,805,488 | 9.17359100 |
| Launch / graduation | 435,536 | 2.21423484 |
| Voting / treasury | 607,104 | 3.08580028 |
| Optional DBC fork | 1,499,184 | 7.61756668 |

**Requested scope (CPMM + CLMM + current gauge binary): 17.05914292 SOL.**
The current gauge binary supports CPMM collections only; adding CLMM support
requires a rebuild and updated size/rent calculation.

Including optional launch/graduation: **19.27337776 SOL**. Adding a separately deployed DBC
fork: **26.89094444 SOL**. Using Meteora's existing deployment avoids paying to
redeploy DBC; it does not remove any configuration or liquidity requirements.

Amounts exclude transaction fees, retries, initialization/configuration accounts,
and liquidity. Fee totals cannot be exact before the actual messages, fee payer,
priority price, and retries are known. No deployment was submitted to produce this
quote. The standalone prototype and three ray-gauges research programs have no
compiled deploy binaries in this workspace, so they are not included in the total.

For a fresh v3 deployment, Agave 4.3.0-rc.1 funds the upload buffer with the
ProgramData rent and the loader drains it back to the payer before creating
ProgramData. Do not double-count that money. An upgrade of an already-funded
program has a different temporary-buffer requirement.

The allocation is exactly ELF length (the installed CLI default), plus the
45-byte ProgramData header and a separate 36-byte Program account. Extra reserved
capacity increases rent. See `deployment-costs.json` for lamports and SHA-256
hashes. Re-query rent and rebuild before a deployment decision.

Sources: [Solana deployment guide](https://solana.com/docs/programs/deploying),
[Agave CLI deployment implementation](https://github.com/anza-xyz/agave/blob/v4.3.0-rc.1/cli/src/program.rs),
[loader buffer transfer](https://github.com/anza-xyz/agave/blob/v4.3.0-rc.1/programs/bpf_loader/src/lib.rs).
