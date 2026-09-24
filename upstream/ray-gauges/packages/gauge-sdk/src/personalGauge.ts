import { BN, web3 } from "@coral-xyz/anchor"
import { accounts, instructions, PROGRAM_ID } from "@raygauge/gauge-gen"
import { PROGRAM_ID as REACTOR_PROGRAM_ID } from "@raygauge/reactor-gen"
import { GaugePDA } from "@raygauge/gauge-pda"
import { ReactorPda } from "@raygauge/reactor-sdk"
import { SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js"

type PersonalGaugeData = {
  /** The address of the gauge program */
  programId: web3.PublicKey
  /** The address of the reactor program */
  reactorProgramId: web3.PublicKey
  /** The address of the pool (CP or CL) */
  poolId: web3.PublicKey
  state: {
    account: accounts.PersonalGauge
  }
}

export interface PersonalGaugeLoadArgs {
  connection: web3.Connection
  poolId: web3.PublicKey
  owner: web3.PublicKey
  programId?: web3.PublicKey
  reactorProgramId?: web3.PublicKey
}

export class PersonalGauge {
  constructor(private data: PersonalGaugeData) {}

  static async load(args: PersonalGaugeLoadArgs) {
    const programId = args.programId ?? PROGRAM_ID
    const reactorProgramId = args.reactorProgramId ?? REACTOR_PROGRAM_ID
    const pda = new GaugePDA(programId)
    const poolGaugeAddress = pda.poolGauge({ poolId: args.poolId })
    const address = pda.personalGauge({ poolGauge: poolGaugeAddress, owner: args.owner })
    const state = await loadState(args.connection, address)
    return new PersonalGauge({ programId, reactorProgramId, poolId: args.poolId, state })
  }

  async reload(connection: web3.Connection) {
    const state = await loadState(connection, this.address)
    this.data.state = state
  }

  get poolId() {
    return this.data.poolId
  }

  get poolGaugeAddress() {
    const pda = new GaugePDA(this.data.programId)
    return pda.poolGauge({ poolId: this.poolId })
  }

  get gaugeConfigAddress() {
    const pda = new GaugePDA(this.data.programId)
    return pda.globalConfig()
  }

  get account() {
    return this.data.state.account
  }

  get owner() {
    return this.data.state.account.owner
  }

  /** The address of the personal gauge */
  get address() {
    const pda = new GaugePDA(this.data.programId)

    return pda.personalGauge({ poolGauge: this.poolGaugeAddress, owner: this.owner })
  }

  /** The number of votes for this personal gauge */
  get votes(): bigint {
    return BigInt(this.account.votes.toString())
  }

  changeVotesIx(amount: bigint) {
    const reactorPda = new ReactorPda({ programId: this.data.reactorProgramId })
    // Get the address of the reactor for this owner
    const reactor = reactorPda.reactor({ owner: this.owner })
    return instructions.changeVotes(
      {
        amount: new BN(amount.toString()),
      },
      {
        owner: this.owner,
        gaugeConfig: this.gaugeConfigAddress,
        poolGauge: this.poolGaugeAddress,
        personalGauge: this.address,
        reactor,
        reactorProg: this.data.reactorProgramId,
        sysvarInstruction: SYSVAR_INSTRUCTIONS_PUBKEY,
      },
    )
  }
}

async function loadState(connection: web3.Connection, address: web3.PublicKey) {
  const account = await accounts.PersonalGauge.fetch(connection, address)
  return { account }
}
