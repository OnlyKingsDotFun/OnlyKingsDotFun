use anchor_lang::prelude::*;

/// Account that tracks the number of votes on a given gauge for a specific user
#[account]
pub struct PersonalGauge {
    /// owner of personal gauge
    pub owner: Pubkey,

    /// Link to pool gauge record
    pub pool_gauge: Pubkey,

    /// Amount of votes pledged to a gauge
    pub votes: u64,
}

impl PersonalGauge {
    pub const SIZE: usize =
        // discriminator
        8 +
        // owner
        32 +
        // pool_gauge
        32 +
        // amount
        8;

    pub fn change_votes(&mut self, amount: i64) {
        let is_inc = amount > 0;
        let amount = amount.abs() as u64;

        if is_inc {
            self.inc_votes(amount);
        } else {
            self.dec_votes(amount);
        }
    }

    fn inc_votes(&mut self, amount: u64) {
        self.votes = self
            .votes
            .checked_add(amount)
            .expect("personal gauge overflow");
    }

    fn dec_votes(&mut self, amount: u64) {
        self.votes = self
            .votes
            .checked_sub(amount)
            .expect("personal gauge underflow");
    }
}
