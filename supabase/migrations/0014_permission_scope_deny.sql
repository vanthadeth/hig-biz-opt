-- 0014_permission_scope_deny
-- `deny` becomes a fourth scope, alongside own / sub / any.
--
-- It has to be added on its own: Postgres will not let a newly added enum value
-- be used in the same transaction that adds it, so everything that reads or
-- writes 'deny' lives in 0015.

alter type public.permission_scope add value if not exists 'deny';
