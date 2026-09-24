use anchor_lang::prelude::*;

use crate::caller_program;
use crate::state::Reactor;
use anchor_lang::solana_program::sysvar::instructions as tx_instructions;

#[derive(Accounts)]
pub struct UnlockVotes<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        has_one = owner,
    )]
    pub reactor: Account<'info, Reactor>,

    /// CHECK: Provide transaction instruction data.
    #[account(address = tx_instructions::ID)]
    pub sysvar_instruction: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<UnlockVotes>, amount: u64) -> Result<()> {
    // lock & unlock must be called from CPI by guage program.
    let current_ix =
        tx_instructions::get_instruction_relative(0, &ctx.accounts.sysvar_instruction).unwrap();
    require_keys_eq!(current_ix.program_id, caller_program::id());

    ctx.accounts.reactor.unlock_votes(amount)?;
    Ok(())
}
