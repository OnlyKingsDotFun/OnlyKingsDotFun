# Reactor

The Reactor stores user-deposited RAY. It adds the following features to RAY:

- utility for voting
- reward emissions (RAY delivered to users)
- isoRAY accrual (additional voting power)

Emissions & isoRAY rates by parameters in the `reactor_config` state.

Accrual to RAY depositors using a common non-decreasing share-value method. Every deposited RAY token is treated as a share of a global pool of "accrued isoRAY" and "emitted RAY rewards".

At every event which changes a user's RAY balance, the user's amount of earned RAY and earned isoRAY must be updated.
