import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('migration is repeatable, RLS isolates users, scores only rise and guests cannot write', async () => {
    const db = new PGlite();
    await db.exec(`
        create role anon; create role authenticated;
        create schema auth; create table auth.users(id uuid primary key);
        create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
        grant usage on schema public,auth to authenticated,anon;
        grant execute on function auth.uid() to authenticated,anon;
        insert into auth.users values ('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002');
    `);
    const file = readdirSync('supabase/migrations').find(file => file.endsWith('_suika_scores.sql'));
    const sql = readFileSync(file ? 'supabase/migrations/' + file : '.evaluation/suika_scores.sql', 'utf8');
    await db.exec(sql); await db.exec(sql);
    await db.exec(`set role authenticated; set request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
        insert into public.suika_scores(user_id,best_score) values (auth.uid(),60);
        insert into public.suika_scores(user_id,best_score) values (auth.uid(),20) on conflict(user_id) do update set best_score=excluded.best_score;
    `);
    assert.equal((await db.query('select best_score from public.suika_scores')).rows[0].best_score, 60);
    await assert.rejects(db.exec("insert into public.suika_scores(user_id,best_score) values ('10000000-0000-0000-0000-000000000002',999)"), /row-level security/);
    await assert.rejects(db.exec("update public.suika_scores set user_id='10000000-0000-0000-0000-000000000002'"), /ownership|row-level security/);
    await assert.rejects(db.exec('delete from public.suika_scores'), /permission denied/);
    await db.exec('update public.suika_scores set best_score=-1');
    assert.equal((await db.query('select best_score from public.suika_scores')).rows[0].best_score, 60);
    await db.exec("set request.jwt.claim.sub='10000000-0000-0000-0000-000000000002'");
    await assert.rejects(db.exec('insert into public.suika_scores(user_id,best_score) values (auth.uid(),-1)'), /check constraint/);
    assert.equal((await db.query('select * from public.suika_scores')).rows.length, 0);
    assert.equal((await db.query('update public.suika_scores set best_score=999 returning *')).rows.length, 0);
    await db.exec("set role anon; set request.jwt.claim.sub=''");
    await assert.rejects(db.exec('select * from public.suika_scores'), /permission denied/);
    await assert.rejects(db.exec("insert into public.suika_scores(user_id,best_score) values ('10000000-0000-0000-0000-000000000001',999)"), /permission denied/);
    await db.close();
});
