-- supabase/migrations/0002_progress_photos.sql
create table public.progress_photos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  photo_date    date not null,
  drive_file_id text not null,
  drive_url     text not null,
  created_at    timestamptz default now()
);

create unique index progress_photos_user_date
  on public.progress_photos (user_id, photo_date);

alter table public.progress_photos enable row level security;

create policy "users manage own progress photos"
  on public.progress_photos for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
