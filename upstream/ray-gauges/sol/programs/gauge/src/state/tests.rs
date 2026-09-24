#[cfg(test)]
mod test {
    use anchor_lang::prelude::*;
    use precise_number::Number;

    use crate::state::{common::PersonalRewarderState, Gauge, GaugeConfig, PersonalRewarderCp};

    #[test]
    fn test_multiple_gauges() {
        let mut gc = GaugeConfig {
            ray_hopper: Pubkey::new_unique(),
            ray_emission_per_day: 360,
            total_votes: 0,
            index: Number::ZERO.into(),
            last_updated_ts: 0,
            bump: [0; 1],
        };

        let mut pg_a = Gauge {
            pool_id: Pubkey::new_unique(),
            total_votes: 0,
            last_seen_global_index: Number::ZERO.into(),
            total_ray_emitted: 0,
        };

        let mut pg_b = Gauge {
            pool_id: Pubkey::new_unique(),
            total_votes: 0,
            last_seen_global_index: Number::ZERO.into(),
            total_ray_emitted: 0,
        };

        // Add 100 votes to A
        gc.change_votes(100);
        pg_a.change_votes(100);

        // Add 200 votes to B
        gc.change_votes(200);
        pg_b.change_votes(200);

        // Sync the gauge with 12 hours (1/2 day) of time
        let now = 12 * 60 * 60;
        gc.update_index(now);
        pg_a.update_index(gc.index.into());
        pg_b.update_index(gc.index.into());

        assert_eq!(gc.total_votes, 300);
        // the index should share out 180 ray (0.5 * 360) to be shared among 300 votes
        assert_eq!(Number::from_ratio(180, 300), gc.index.into());

        // Pool A should have 60 ray
        assert_eq!(pg_a.total_ray_emitted, 60);
        // Pool B should have twice as much
        assert_eq!(pg_b.total_ray_emitted, 120);
    }

    #[test]
    fn test_personal_rewarder_earn() {
        let mut gc = GaugeConfig {
            ray_hopper: Pubkey::new_unique(),
            ray_emission_per_day: 360,
            total_votes: 0,
            index: Number::ZERO.into(),
            last_updated_ts: 0,
            bump: [0; 1],
        };

        let mut pg = Gauge {
            pool_id: Pubkey::new_unique(),
            total_votes: 0,
            last_seen_global_index: Number::ZERO.into(),
            total_ray_emitted: 0,
        };

        let mut bilbo = PersonalRewarderCp {
            owner: Pubkey::new_unique(),
            pool_gauge: Pubkey::new_unique(),
            rewarder: PersonalRewarderState::default(),
        };

        gc.change_votes(100);
        pg.change_votes(100);

        // Sync the gauge with 6 hours (1/4 day) of time
        let now = 6 * 60 * 60;
        gc.update_index(now);
        pg.update_index(gc.index.into());

        assert_eq!(gc.total_votes, 100);
        assert_eq!(pg.total_votes, 100);

        // 90 ray have been emitted (0.25 * 360) to be shared among 100 votes
        let global_index: Number = gc.index.into();
        assert_eq!(global_index, Number::from_ratio(90, 100));

        // assert that the pool gauge has sync'd its index
        let pool_index: Number = pg.last_seen_global_index.into();
        assert_eq!(pool_index, global_index);

        assert_eq!(pg.total_ray_emitted, 90);

        // bilbo has earned a full 6 hours of time units
        bilbo.sync_and_stage(
            now,
            pg.total_ray_emitted,
            Number::from_natural_u64(6 * 60 * 60),
        );

        // truncation means bilbo only earns 89 ray
        assert_eq!(bilbo.rewarder.staged_ray, 89);
        assert_eq!(bilbo.rewarder.last_seen_total_emitted_ray, 90);
        assert_eq!(
            Into::<Number>::into(bilbo.rewarder.last_seen_time_units),
            Number::from_natural_u64(6 * 60 * 60)
        );
        assert_eq!(bilbo.rewarder.last_updated_ts, now);
    }
}
