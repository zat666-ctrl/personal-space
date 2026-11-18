-- Run through an authorized SQL connection. This simulates database roles only;
-- it creates no login/token/account and rolls back every test score.
begin;
do $test$
declare
  owner_id uuid;
  other_id uuid := gen_random_uuid();
  initial_best integer;
  actual_best integer;
  affected integer;
begin
  select id into owner_id from auth.users order by created_at limit 1;
  if owner_id is null then raise exception 'A real existing Auth user is required for this transactional test'; end if;
  select coalesce(best_score,0) into initial_best from public.suika_scores where user_id=owner_id;
  initial_best := coalesce(initial_best,0);
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  execute 'set local role authenticated';
  insert into public.suika_scores(user_id,best_score) values(owner_id,greatest(initial_best,3))
    on conflict(user_id) do update set best_score=excluded.best_score;
  update public.suika_scores set best_score=0 where user_id=owner_id;
  select best_score into actual_best from public.suika_scores where user_id=owner_id;
  if actual_best <> greatest(initial_best,3) then raise exception 'Monotonic own-score read/write failed'; end if;
  begin
    update public.suika_scores set user_id=other_id where user_id=owner_id;
    raise exception 'Ownership reassignment was incorrectly allowed';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub',other_id::text,true);
  if exists(select 1 from public.suika_scores where user_id=owner_id) then raise exception 'Cross-user read was allowed'; end if;
  update public.suika_scores set best_score=99 where user_id=owner_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Cross-user update was allowed'; end if;
  begin
    insert into public.suika_scores(user_id,best_score) values(owner_id,99);
    raise exception 'Cross-user insert was incorrectly allowed';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
  execute 'set local role anon';
  begin
    perform 1 from public.suika_scores;
    raise exception 'Guest read was incorrectly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.suika_scores(user_id,best_score) values(owner_id,99);
    raise exception 'Guest write was incorrectly allowed';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
end;
$test$;
rollback;
select 'PASS: own read/write, monotonic best, ownership immutable, cross-user read/write denied, guest read/write denied; all test scores rolled back' as result;
