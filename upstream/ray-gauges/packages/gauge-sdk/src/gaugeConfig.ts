import { web3 } from "@coral-xyz/anchor"
import { accounts, instructions } from "@raygauge/gauge-gen"
import { GaugePDA } from "@raygauge/gauge-pda"
import { PreciseNumber } from "@raygauge/number"

type GaugeConfigData = {
  programId?: web3.PublicKey
  state: {
    account: accounts.GaugeConfig
  }
}

export interface GaugeConfigLoadArgs {
  connection: web3.Connection
  programId?: web3.PublicKey
}

/** SDK for interacting with the global config for the gauge program */
export class GaugeConfig {
  constructor(private config: GaugeConfigData) {}

  static async load(args: GaugeConfigLoadArgs) {
    const pda = new GaugePDA(args.programId)
    const address = pda.globalConfig()
    const state = await loadState(args.connection, address)
    return new GaugeConfig({ programId: args.programId, state })
  }

  async reload(cnx: web3.Connection) {
    const state = await loadState(cnx, this.address)
    this.config.state = state
  }

  get pda() {
    return new GaugePDA(this.config.programId)
  }

  /** The address of the global config PDA */
  get address() {
    return this.pda.globalConfig()
  }

  get state() {
    return this.config.state
  }

  get account() {
    return this.state.account
  }

  get rayHopper() {
    return this.account.rayHopper
  }

  get rayEmissionPerDay(): bigint {
    return BigInt(this.account.rayEmissionPerDay.toString())
  }

  get totalVotes(): bigint {
    return BigInt(this.account.totalVotes.toString())
  }

  get lastUpdatedTs(): bigint {
    return BigInt(this.account.lastUpdatedTs.toString())
  }

  /** Global index for RAY rewards per gauge vote */
  get index(): string {
    return PreciseNumber.fromRaw(this.account.index.val).valueString
  }

  initPoolGaugeIx({ poolId, payer }: { poolId: web3.PublicKey; payer: web3.PublicKey }) {
    const pda = this.pda
    const poolGauge = pda.poolGauge({ poolId })
    return instructions.initPoolGauge({
      payer,
      gaugeConfig: this.address,
      poolGauge,
      poolId,
      systemProgram: web3.SystemProgram.programId,
    })
  }
}

async function loadState(connection: web3.Connection, address: web3.PublicKey) {
  const account = await accounts.GaugeConfig.fetch(connection, address)
  return { account }
}
