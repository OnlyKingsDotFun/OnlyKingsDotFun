use anchor_lang::prelude::*;

mod clock;
mod errors;
mod instructions;
pub mod state;

use instructions::*;

pub mod admin {
    use anchor_lang::prelude::declare_id;

    #[cfg(feature = "localnet")]
    declare_id!("v9mcAqmTbjJuFdbD5mMtNuTgwh2FhNCHQVPrf7W3dva");

    #[cfg(not(feature = "localnet"))]
    declare_id!("GThUX1Atko4tqhN2NaiTazWSeFWMuiUvfFnyJyUghFMJ");
}

pub mod caller_program {
    anchor_lang::prelude::declare_id!("b1tVsd3q8i4JpSJctQCQtkScXou4mVaKVhSJThiqf3s");
}

pub mod ray_mint {
    use anchor_lang::prelude::declare_id;
    declare_id!("4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R");
}

pub const REACTOR_SEED: &str = "reactor";
pub const REACTOR_CONFIG_SEED: &str = "config";
pub const REACTOR_VAULT_SEED: &str = "ray-vault";
pub const REACTOR_REWARD_HOPPER_SEED: &str = "ray-reward-hopper";

declare_id!("DYt9TpjENhrD8GCBPiBkwVNbb8jDAELqnCCGrHqKzvwY");

#[program]
pub mod reactor {
    use super::*;

    /// Initialize the reactor config
    pub fn init_config(
        ctx: Context<InitConfig>,
        ray_reward_daily_emission: u64,
        iso_ray_apr_bps: u16,
    ) -> Result<()> {
        init_config::handler(ctx, ray_reward_daily_emission, iso_ray_apr_bps)
    }

    /// Initialize a personal reactor account
    pub fn init_reactor(ctx: Context<InitReactor>) -> Result<()> {
        init_reactor::handler(ctx)
    }

    /// Deposit RAY tokens into the reactor
    pub fn deposit_ray(ctx: Context<DepositRay>, amount: u64) -> Result<DepositRayEvent> {
        deposit_ray::handler(ctx, amount)
    }

    /// Withdraw RAY tokens from the reactor
    pub fn withdraw_ray(ctx: Context<WithdrawRay>, amount: u64) -> Result<()> {
        withdraw_ray::handler(ctx, amount)
    }

    /// Lock Reactor votes
    pub fn lock_votes(ctx: Context<LockVotes>, amount: u64) -> Result<()> {
        lock_votes::handler(ctx, amount)
    }

    /// Unlock Reactor votes
    pub fn unlock_votes(ctx: Context<UnlockVotes>, amount: u64) -> Result<()> {
        unlock_votes::handler(ctx, amount)
    }

    /// Update the reactor's global indexes
    pub fn sync_reactor(ctx: Context<SyncReactor>) -> Result<()> {
        sync_reactor::handler(ctx)
    }

    /// Update the reactor's global indexes and collect the ray rewards
    pub fn sync_and_collect_ray_rewards(ctx: Context<SyncAndCollectRayRewards>) -> Result<()> {
        sync_and_collect_ray_rewards::handler(ctx)
    }

    /// Collect the earned RAY rewards
    pub fn collect_ray_rewards(ctx: Context<CollectRayRewards>) -> Result<()> {
        collect_ray_rewards::handler(ctx)
    }
}
