use anchor_lang::prelude::*;

mod instructions;
pub mod pda;
pub mod state;
mod syncer;

use instructions::*;

declare_id!("b1tVsd3q8i4JpSJctQCQtkScXou4mVaKVhSJThiqf3s");

pub mod admin {
    use anchor_lang::prelude::declare_id;

    #[cfg(feature = "localnet")]
    declare_id!("v9mcAqmTbjJuFdbD5mMtNuTgwh2FhNCHQVPrf7W3dva");

    #[cfg(not(feature = "localnet"))]
    declare_id!("GThUX1Atko4tqhN2NaiTazWSeFWMuiUvfFnyJyUghFMJ");
}

#[program]
pub mod gauge {
    use super::*;

    pub fn init_global_config(
        ctx: Context<InitGaugeConfig>,
        ray_emission_per_day: u64,
    ) -> Result<()> {
        init_global_config::handler(ctx, ray_emission_per_day)
    }

    /// Init a vote-tracking gauge
    pub fn init_personal_gauge(ctx: Context<InitPersonalGauge>) -> Result<()> {
        init_personal_gauge::handler(ctx)
    }

    pub fn init_pool_gauge(ctx: Context<InitConstantGauge>) -> Result<()> {
        init_pool_gauge::handler(ctx)
    }

    /// Pledge/Unpledge votes to a gauge
    pub fn change_votes(ctx: Context<ChangeVotes>, amount: i64) -> Result<()> {
        change_votes::handler(ctx, amount)
    }

    /// Update the pool's index to the global index
    pub fn sync_pool_index(ctx: Context<SyncPoolIndex>) -> Result<()> {
        sync_pool_index::handler(ctx)
    }

    /// CP: Initialize the personal RAY rewarder
    pub fn cp_init_personal_rewarder(ctx: Context<InitPersonalRewarder>) -> Result<()> {
        instructions::constant_product::init_personal_rewarder::handler(ctx)
    }

    /// CP: Accrue RAY to the PersonalRewarder with a CP flavor
    pub fn cp_accrue_ray(ctx: Context<AccrueRay>) -> Result<()> {
        instructions::constant_product::accrue_ray::handler(ctx)
    }

    /// CP:Withdraw earned RAY from the hopper and zero-out staged ray in the rewarder
    pub fn cp_withdraw_ray(ctx: Context<WithdrawRay>) -> Result<WithdrawRayEvent> {
        instructions::constant_product::withdraw_ray::handler(ctx)
    }

    /// CL: Withdraw earned RAY from the hopper and zero-out staged ray in the rewarder
    pub fn cl_withdraw_ray(ctx: Context<WithdrawRayCl>) -> Result<WithdrawRayClEvent> {
        instructions::concentrated::withdraw_ray::handler(ctx)
    }

    /// Accrue RAY to the PersonalRewarder with a Concentrated flavor
    pub fn cl_accrue_ray(ctx: Context<AccrueRayCl>) -> Result<()> {
        instructions::concentrated::accrue_ray::handler(ctx)
    }

    /// Init the personal rewarder for the concentrated flavor
    pub fn cl_init_personal_rewarder(ctx: Context<InitPersonalRewarderCl>) -> Result<()> {
        instructions::concentrated::init_personal_rewarder::handler(ctx)
    }
}
