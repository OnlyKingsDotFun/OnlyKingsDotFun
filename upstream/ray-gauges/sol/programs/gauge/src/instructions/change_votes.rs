use crate::{
    state::*,
    syncer::{get_now, sync_gauge},
};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions as tx_instructions;
use reactor::cpi::accounts::{LockVotes, UnlockVotes};
use reactor::program::Reactor as ReactorProgram;

#[derive(Accounts)]
pub struct ChangeVotes<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    /// Global config for Gauge instance
    #[account(mut)]
    pub gauge_config: Account<'info, GaugeConfig>,

    /// Gauge for the pool
    #[account(mut)]
    pub pool_gauge: Account<'info, Gauge>,

    /// Personal vote account for owner
    #[account(
        mut,
        has_one = owner,
        has_one = pool_gauge
    )]
    pub personal_gauge: Account<'info, PersonalGauge>,

    /// Personal reactor account for owner
    #[account(
        mut,
        has_one = owner,
    )]
    pub reactor: Account<'info, reactor::state::Reactor>,

    pub reactor_prog: Program<'info, ReactorProgram>,

    /// CHECK: Provide transaction instruction data.
    #[account(address = tx_instructions::ID)]
    pub sysvar_instruction: UncheckedAccount<'info>,
}

impl<'info> ChangeVotes<'info> {
    fn unlock_votes_ctx(&self) -> CpiContext<'_, '_, '_, 'info, UnlockVotes<'info>> {
        CpiContext::new(
            self.reactor_prog.to_account_info(),
            UnlockVotes {
                owner: self.owner.to_account_info(),
                reactor: self.reactor.to_account_info(),
                sysvar_instruction: self.sysvar_instruction.to_account_info(),
            },
        )
    }

    fn lock_votes_ctx(&self) -> CpiContext<'_, '_, '_, 'info, LockVotes<'info>> {
        CpiContext::new(
            self.reactor_prog.to_account_info(),
            LockVotes {
                owner: self.owner.to_account_info(),
                reactor: self.reactor.to_account_info(),
                sysvar_instruction: self.sysvar_instruction.to_account_info(),
            },
        )
    }

    fn cpi_change_votes(&self, amount: i64) -> Result<()> {
        let is_lock = amount > 0;
        let amount: u64 = amount.abs().try_into().unwrap();
        if is_lock {
            reactor::cpi::lock_votes(self.lock_votes_ctx(), amount)
        } else {
            reactor::cpi::unlock_votes(self.unlock_votes_ctx(), amount)
        }
    }
}

pub fn handler(ctx: Context<ChangeVotes>, amount: i64) -> Result<()> {
    // attempt to un/lock the amount of votes
    ctx.accounts.cpi_change_votes(amount)?;

    let now = get_now();

    handle_change_votes(
        now,
        &mut ctx.accounts.gauge_config,
        &mut ctx.accounts.pool_gauge,
        &mut ctx.accounts.personal_gauge,
        amount,
    );

    emit!(VotesChangedEvent {
        user: ctx.accounts.owner.key(),
        gauge: ctx.accounts.pool_gauge.key(),
        amount_changed: amount,
        total_personal_votes_on_gauge: ctx.accounts.personal_gauge.votes,
        total_votes_on_gauge: ctx.accounts.pool_gauge.total_votes,
        global_total_votes: ctx.accounts.gauge_config.total_votes,
    });

    Ok(())
}

fn handle_change_votes(
    now: u64,
    gauge_config: &mut GaugeConfig,
    pool_gauge: &mut Gauge,
    personal_gauge: &mut PersonalGauge,
    amount: i64,
) {
    sync_gauge(now, gauge_config, pool_gauge);

    // update the global votes
    gauge_config.change_votes(amount);

    // update the pool gauge votes
    pool_gauge.change_votes(amount);

    // update the personal gauge votes
    personal_gauge.change_votes(amount);
}

#[event]
pub struct VotesChangedEvent {
    pub user: Pubkey,
    pub gauge: Pubkey,

    /// Amount of votes pledged
    pub amount_changed: i64,

    /// New total personal amount of votes in the gauge
    pub total_personal_votes_on_gauge: u64,

    /// Total amount of votes in the gauge
    pub total_votes_on_gauge: u64,

    /// Total votes across all gauges
    pub global_total_votes: u64,
}
