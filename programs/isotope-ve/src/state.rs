use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace, Default)]
pub struct VeConfig {
    pub bump: u8,
    pub escrow_bump: u8,
    pub treasury_bump: u8,
    pub admin: Pubkey,
    /// the vote token
    pub proto_mint: Pubkey,
    /// cp-swap fork (or mainnet cp-swap); pools whose creator is `treasury` and the POL pool live here
    pub cpmm_program: Pubkey,
    /// epoch 0 starts here; epoch = (now - epoch_start) / epoch_secs
    pub epoch_start: i64,
    pub epoch_secs: i64,
    /// power = amount * remaining / max_lock_secs
    pub max_lock_secs: i64,
    pub min_lock_secs: i64,
    /// largest quote amount one `recycle` call may push into the POL pool (bounds sandwich profit)
    pub recycle_cap: u64,
    /// max tolerated shortfall vs the pool-implied swap output, in bps
    pub recycle_slippage_bps: u16,
    pub padding: [u64; 6],
}

impl VeConfig {
    pub fn current_epoch(&self, now: i64) -> Result<u64> {
        require!(now >= self.epoch_start, crate::error::VeError::EpochOpen);
        Ok(((now - self.epoch_start) / self.epoch_secs) as u64)
    }
}

/// One per owner: locked protocol tokens and the per-epoch vote budget.
#[account]
#[derive(InitSpace, Default)]
pub struct Lock {
    pub bump: u8,
    pub owner: Pubkey,
    pub amount: u64,
    /// unix time the lock expires
    pub end: i64,
    /// epoch in which `vote_used` was spent
    pub vote_epoch: u64,
    pub vote_used: u64,
    pub padding: [u64; 4],
}

impl Lock {
    /// linear decay: amount * remaining / max
    pub fn power(&self, now: i64, max_lock_secs: i64) -> u64 {
        if now >= self.end {
            return 0;
        }
        let remaining = (self.end - now) as u128;
        ((self.amount as u128) * remaining / (max_lock_secs as u128)) as u64
    }
}

/// One per cp-swap `TokenCollection`. Fees arrive in the collection's quote and are paid out in kind.
#[account]
#[derive(InitSpace, Default)]
pub struct Gauge {
    pub bump: u8,
    pub collection: Pubkey,
    pub quote_mint: Pubkey,
    /// token account (authority = this gauge) holding undistributed fees
    pub vault: Pubkey,
    pub lifetime_fees: u64,
    pub padding: [u64; 4],
}

/// Per (gauge, epoch): votes cast during the epoch and fees that arrived during it.
#[account]
#[derive(InitSpace, Default)]
pub struct GaugeEpoch {
    pub bump: u8,
    pub gauge: Pubkey,
    pub epoch: u64,
    pub total_weight: u64,
    pub fees: u64,
    pub claimed: u64,
    pub padding: [u64; 2],
}

/// Per (lock, gauge, epoch).
#[account]
#[derive(InitSpace, Default)]
pub struct Vote {
    pub bump: u8,
    pub lock: Pubkey,
    /// lock owner at vote time; claims survive the lock being withdrawn and closed
    pub owner: Pubkey,
    pub gauge: Pubkey,
    pub epoch: u64,
    pub weight: u64,
    pub claimed: bool,
    pub padding: [u64; 2],
}

/// Where treasury inflows denominated in `quote_mint` go when recycled.
#[account]
#[derive(InitSpace, Default)]
pub struct QuoteRoute {
    pub bump: u8,
    pub quote_mint: Pubkey,
    /// gauge that receives the voter share (its quote_mint must equal `quote_mint`)
    pub gauge: Pubkey,
    /// cp-swap PROTO/quote pool the POL share is deposited into
    pub pol_pool: Pubkey,
    /// share of each recycle that becomes protocol-owned liquidity; the rest goes to `gauge`
    pub pol_bps: u16,
    pub padding: [u64; 4],
}
