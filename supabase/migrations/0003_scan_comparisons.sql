-- Cache AI-generated comparison narratives keyed by (user, scan_a, scan_b)
create table if not exists scan_comparisons (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  scan_a_id   uuid not null,
  scan_b_id   uuid not null,
  narrative   text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, scan_a_id, scan_b_id)
);

alter table scan_comparisons enable row level security;

create policy "Users manage own comparisons"
  on scan_comparisons for all
  using (auth.uid() = user_id);
