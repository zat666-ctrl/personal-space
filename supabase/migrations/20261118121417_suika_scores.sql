begin;
create table if not exists public.suika_scores (
  user_id uuid primary key references auth.users(id) on delete cascade,
  best_score integer not null default 0 check (best_score >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.suika_scores enable row level security;
revoke all on public.suika_scores from public, anon, authenticated;
grant select on public.suika_scores to authenticated;
grant insert (user_id, best_score), update (user_id, best_score) on public.suika_scores to authenticated;

-- A concurrent, stale device can never overwrite a higher score.
create or replace function public.suika_keep_best()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'Score ownership cannot change' using errcode = '42501';
  end if;
  new.best_score := greatest(old.best_score, new.best_score);
  new.created_at := old.created_at;
  new.updated_at := case when new.best_score > old.best_score then now() else old.updated_at end;
  return new;
end;
$$;
revoke all on function public.suika_keep_best() from public, anon, authenticated;

drop trigger if exists suika_scores_keep_best on public.suika_scores;
create trigger suika_scores_keep_best before update on public.suika_scores
for each row execute function public.suika_keep_best();

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'suika_scores' and policyname = 'suika_scores_select_own') then
    create policy suika_scores_select_own on public.suika_scores for select to authenticated
      using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'suika_scores' and policyname = 'suika_scores_insert_own') then
    create policy suika_scores_insert_own on public.suika_scores for insert to authenticated
      with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'suika_scores' and policyname = 'suika_scores_update_own') then
    create policy suika_scores_update_own on public.suika_scores for update to authenticated
      using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
end;
$$;
comment on table public.suika_scores is 'Personal Suika best scores. Client-reported; not server-verified or cheat-proof.';
commit;
