import { web3 } from "@coral-xyz/anchor"
import { PROGRAM_ID } from "@raygauge/gauge-gen"

export class GaugePDA {
  constructor(public programId = PROGRAM_ID) {}

  private findProgramAddressSync(seeds: Buffer[]) {
    return web3.PublicKey.findProgramAddressSync(seeds, this.programId)[0]
  }

  /** Pool ID is address of CP-Swap pool or CL pool */
  poolGauge({ poolId }: { poolId: web3.PublicKey }) {
    return this.findProgramAddressSync([Buffer.from("pool-gauge"), poolId.toBuffer()])
  }

  personalGauge({ owner, poolGauge }: { owner: web3.PublicKey; poolGauge: web3.PublicKey }) {
    return this.findProgramAddressSync([Buffer.from("personal-gauge"), poolGauge.toBuffer(), owner.toBuffer()])
  }

  personalRewarderCp({ poolGauge, owner }: { poolGauge: web3.PublicKey; owner: web3.PublicKey }) {
    return this.findProgramAddressSync([Buffer.from("personal-rewarder-cp"), poolGauge.toBuffer(), owner.toBuffer()])
  }

  /** Personal rewarder for concentrated liquidity
   *
   * @param personalLiqPosition - The personal liquidity position for the concentrated liquidity pool
   * @returns The personal rewarder PDA
   */
  personalRewarderCl({ personalLiqPosition }: { personalLiqPosition: web3.PublicKey }) {
    return this.findProgramAddressSync([Buffer.from("personal-rewarder-cl"), personalLiqPosition.toBuffer()])
  }

  globalRayHopper() {
    return this.findProgramAddressSync([Buffer.from("ray-hopper")])
  }

  globalConfig() {
    return this.findProgramAddressSync([Buffer.from("global-config")])
  }
}
