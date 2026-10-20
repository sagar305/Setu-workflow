ALTER TABLE firms
  ADD COLUMN is_trial BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN trial_started_at TIMESTAMP(3),
  ADD COLUMN trial_ends_at TIMESTAMP(3);
ALTER TABLE firms ADD CONSTRAINT firm_trial_dates CHECK (
  (trial_started_at IS NULL AND trial_ends_at IS NULL) OR
  (trial_started_at IS NOT NULL AND trial_ends_at IS NOT NULL AND trial_ends_at > trial_started_at)
);
