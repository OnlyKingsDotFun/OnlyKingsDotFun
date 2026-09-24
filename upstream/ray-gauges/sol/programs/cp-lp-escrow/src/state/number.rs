use anchor_lang::prelude::*;
use precise_number::Number;

#[derive(AnchorDeserialize, AnchorSerialize, Default, Clone, Copy)]
pub struct NumberRaw {
    pub val: [u64; 4],
}

impl NumberRaw {
    pub const SIZE: usize = 32;
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
