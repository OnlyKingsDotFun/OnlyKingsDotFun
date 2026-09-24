use std::ops::AddAssign;

use anchor_lang::prelude::*;
use precise_number::Number;

#[derive(AnchorDeserialize, AnchorSerialize, Default, Clone, Copy, Debug)]
pub struct NumberRaw {
    pub val: [u64; 4],
}

impl NumberRaw {
    pub const LEN: usize = 4 * 8;
}

impl From<NumberRaw> for Number {
    fn from(raw: NumberRaw) -> Self {
        Number(raw.val)
    }
}

impl Into<NumberRaw> for Number {
    fn into(self) -> NumberRaw {
        NumberRaw { val: self.0 }
    }
}

impl AddAssign<Number> for NumberRaw {
    fn add_assign(&mut self, rhs: Number) {
        let s = rhs + Number(self.val);
        self.val = s.0;
    }
}
