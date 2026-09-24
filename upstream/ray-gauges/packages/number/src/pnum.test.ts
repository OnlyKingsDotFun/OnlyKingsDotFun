import BN from "bn.js"
import { ONE, stringToU256, u256ToString } from "./pnum"
import { expect } from "chai"

describe("precise-number", () => {
  it("handles 0", () => {
    const pn = stringToU256("0")
    expect(pn[0].isZero()).to.be.true
    expect(pn[1].isZero()).to.be.true
    expect(pn[2].isZero()).to.be.true
    expect(pn[3].isZero()).to.be.true
  })

  it("handles 1", () => {
    const pn = stringToU256("1")
    expect(pn[0].toNumber()).to.eq(ONE)
    expect(pn[1].isZero()).to.be.true
    expect(pn[2].isZero()).to.be.true
    expect(pn[3].isZero()).to.be.true
  })

  it("handles multiple words", () => {
    const val = "1000000000"
    const pn = stringToU256(val)
    const target = new BN(val).mul(new BN(ONE))
    const pnVal = pn[0].add(pn[1].shln(64)).add(pn[2].shln(128)).add(pn[3].shln(192))
    expect(pnVal.eq(target)).to.be.true

    // Check that it goes back to the original value
    const s = u256ToString(pn)
    expect(s).to.eq(val)
  })
})
