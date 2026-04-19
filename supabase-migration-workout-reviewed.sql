-- Add reviewed_at timestamp to client_workouts so the Done button in the
-- Review screen can persist that a trainer has reviewed a given workout.
-- Nullable: existing rows stay unreviewed until explicitly marked.

alter table client_workouts
  add column if not exists reviewed_at timestamptz;

create index if not exists idx_client_workouts_reviewed_at
  on client_workouts (reviewed_at);
