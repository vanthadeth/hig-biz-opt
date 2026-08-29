-- 0011_revoke_anon
-- Nothing in this application is public. By default Supabase grants `anon` the
-- same DML as `authenticated` on every table in `public`, which is harmless only
-- for as long as every table has RLS enabled and no policy names `anon` — one
-- forgotten `enable row level security` on a future table would expose it.
--
-- Signing in happens through the auth endpoints, not through PostgREST, so the
-- anonymous role needs no table access at all. Taking it away means a mistake in
-- a policy costs a bug rather than a data leak.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- The app itself never signs in anonymously, so schema access goes too.
revoke usage on schema public from anon;
