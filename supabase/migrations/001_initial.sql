begin;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.dashboard_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  shortcuts jsonb not null default '[]'::jsonb,
  shortcut_folders jsonb not null default '[]'::jsonb,
  todos jsonb not null default '[]'::jsonb,
  daily_focus jsonb not null default '{}'::jsonb,
  widget_positions jsonb not null default '{}'::jsonb,
  page_data jsonb not null default '{}'::jsonb,
  quick_notes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  content text not null default '',
  tags text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_user_updated_idx
  on public.notes (user_id, updated_at desc);

create index if not exists notes_search_idx
  on public.notes using gin (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, ''))
  );

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  object_path text not null unique,
  name text not null check (char_length(name) between 1 and 255),
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists files_user_created_idx
  on public.files (user_id, created_at desc);

drop trigger if exists dashboard_state_set_updated_at on public.dashboard_state;
create trigger dashboard_state_set_updated_at
before update on public.dashboard_state
for each row execute function public.set_updated_at();

drop trigger if exists notes_set_updated_at on public.notes;
create trigger notes_set_updated_at
before update on public.notes
for each row execute function public.set_updated_at();

drop trigger if exists files_set_updated_at on public.files;
create trigger files_set_updated_at
before update on public.files
for each row execute function public.set_updated_at();

alter table public.dashboard_state enable row level security;
alter table public.notes enable row level security;
alter table public.files enable row level security;

revoke all on table public.dashboard_state, public.notes, public.files from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.dashboard_state, public.notes, public.files to authenticated;

drop policy if exists "dashboard_state_select_own" on public.dashboard_state;
create policy "dashboard_state_select_own"
on public.dashboard_state for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "dashboard_state_insert_own" on public.dashboard_state;
create policy "dashboard_state_insert_own"
on public.dashboard_state for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "dashboard_state_update_own" on public.dashboard_state;
create policy "dashboard_state_update_own"
on public.dashboard_state for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "dashboard_state_delete_own" on public.dashboard_state;
create policy "dashboard_state_delete_own"
on public.dashboard_state for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "notes_select_own" on public.notes;
create policy "notes_select_own"
on public.notes for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "notes_insert_own" on public.notes;
create policy "notes_insert_own"
on public.notes for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "notes_update_own" on public.notes;
create policy "notes_update_own"
on public.notes for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "notes_delete_own" on public.notes;
create policy "notes_delete_own"
on public.notes for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "files_select_own" on public.files;
create policy "files_select_own"
on public.files for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "files_insert_own" on public.files;
create policy "files_insert_own"
on public.files for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "files_update_own" on public.files;
create policy "files_update_own"
on public.files for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "files_delete_own" on public.files;
create policy "files_delete_own"
on public.files for delete to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('personal-files', 'personal-files', false, 52428800, null)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = null;

drop policy if exists "personal_files_select_own" on storage.objects;
create policy "personal_files_select_own"
on storage.objects for select to authenticated
using (
  bucket_id = 'personal-files'
  and owner_id = (select auth.uid()::text)
);

drop policy if exists "personal_files_insert_own" on storage.objects;
create policy "personal_files_insert_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'personal-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "personal_files_update_own" on storage.objects;
create policy "personal_files_update_own"
on storage.objects for update to authenticated
using (
  bucket_id = 'personal-files'
  and owner_id = (select auth.uid()::text)
)
with check (
  bucket_id = 'personal-files'
  and owner_id = (select auth.uid()::text)
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "personal_files_delete_own" on storage.objects;
create policy "personal_files_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'personal-files'
  and owner_id = (select auth.uid()::text)
);

commit;

