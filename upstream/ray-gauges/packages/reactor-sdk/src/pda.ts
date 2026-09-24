import { web3 } from "@coral-xyz/anchor"
import { PROGRAM_ID } from "@raygauge/reactor-gen"

export interface PDAParams {
  programId?: web3.PublicKey
}

export class ReactorPda {
  public programId: web3.PublicKey
  constructor(params: PDAParams) {
    this.programId = params.programId || PROGRAM_ID
  }

  private findProgramAddressSync(seeds: Buffer[]) {
    return web3.PublicKey.findProgramAddressSync(seeds, this.programId)[0]
  }

  /** Personal reactor account for owner */
  reactor({ owner }: { owner: web3.PublicKey }) {
    return this.findProgramAddressSync([Buffer.from("reactor"), owner.toBuffer()])
  }

  /** Global config account for the Reactor program */
  tenant() {
    return this.findProgramAddressSync([Buffer.from("config")])
  }

  /** Vault that holds the deposited RAY */
  rayVault() {
    return this.findProgramAddressSync([Buffer.from("ray-vault")])
  }

  /** Hopper that holds the emitted RAY rewards */
  rayHopper() {
    return this.findProgramAddressSync([Buffer.from("ray-reward-hopper")])
  }
}
