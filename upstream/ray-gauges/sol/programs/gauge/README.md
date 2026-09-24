Gauges distribute RAY to LP farmers.

In what follows, we will assume we are using the CP-Swap AMM paradigm, with fungible LP tokens.

There is a global daily RAY emission to _all_ pools.

This amount is shared out by "votes" on gauges. The amount of RAY to each gauge is proportional to the relative vote shares on that gauge.

RAY*emitted = (duration / day) * RAY*per_day
RAY_earned_by_gauge = RAY_emitted * (votes_on_gauge / total_votes)

To track the actual RAY earned per gauge over time, there is a global index:

RAY_global_index = RAY_emitted / total_votes

To compute the amount of RAY earned by a pool's gauge, multiply by `votes_on_gauge`.

At a given point in time t1, the accumulated RAY earned by a gauge is:

RAY_accrued = (RAY_global_index_t1 - RAY_global_index_t0) \* votes_on_gauge

Going one step further, the amount of RAY earned by a gauge needs to shared out to LP token holders. And so another index is required, translating the share value of LP tokens into earned RAY:

LP_token_index = RAY_accrued / total_LP_tokens

The amount of RAY earned by a LP token holder is:

RAY_earned = (LP_token_index_t1 - LP_token_index_t0) \* LP_tokens
