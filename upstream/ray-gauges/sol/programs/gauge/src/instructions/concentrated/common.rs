use precise_number::Number;
use raydium_amm_v3::states::{PersonalPositionState, PoolState};
use std::cell::Ref;

/// Get the index of the reward info that has the special time tracker mint
pub fn get_time_tracker_reward_info_index(_pool_state: Ref<'_, PoolState>) -> usize {
    // TODO - get the time tracker mint from the pool state
    // pool_state.reward_infos.iter().position(|r| r.token_mint == TIME_TRACKER_MINT).unwrap()
    return 0;
}

pub fn get_current_earned_time_units(
    pool_state: Ref<'_, PoolState>,
    pool_position: &PersonalPositionState,
) -> Number {
    let time_tracker_reward_info_index = get_time_tracker_reward_info_index(pool_state);

    let earned_time_units =
        pool_position.reward_infos[time_tracker_reward_info_index].reward_amount_owed;

    return Number::from(earned_time_units);
}
