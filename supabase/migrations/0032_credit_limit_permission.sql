-- 0032_credit_limit_permission
--
-- A credit limit is how much of HIG's money a shop is allowed to owe. Until now
-- it was an ordinary box on the customer form, which meant any rep who could
-- edit their own accounts could raise it on the way past.
--
-- Two changes:
--
--   * Every shop starts at $500 rather than at nothing. "No limit set" and
--     "unlimited" look the same in a numeric column, and the second is not what
--     anybody meant.
--   * Changing it is its own permission, held by the sale supervisor, the sale
--     manager, accounting and the administrator. A super admin holds it the way
--     they hold everything — app.effective_scope short-circuits on the flag.
--
-- Row level security chooses rows, not columns, so a policy cannot say "this
-- person may edit the shop but not that field". A trigger can, and does.
--
-- Two roles are new. Sale Supervisor and Sale Manager did not exist; they are
-- seeded with exactly the Sales Team permission set plus this one, and their
-- scopes are left for somebody to set from the Roles screen rather than guessed
-- at here.

-- The default, in one place ------------------------------------------------------
-- Referenced by both the column default and the guard below, so the number a new
-- shop starts on and the number the guard treats as "not a decision" cannot
-- drift apart.
create function app.default_credit_limit()
returns numeric
language sql
immutable
as $$
  select 500::numeric;
$$;

grant execute on function app.default_credit_limit() to authenticated;

alter table public.customers
  alter column credit_limit_usd set default app.default_credit_limit();

-- The permission -----------------------------------------------------------------
-- A module with no row in view_modules, so it never appears in anybody's
-- navigation. It exists to be granted: app.my_nav reads view_modules, while
-- app.can and the permission matrix read modules, which is exactly the split
-- a field-level permission needs.
insert into public.modules (key, name, icon, href, sort_order) values
  ('customer_credit', 'Customer Credit Limit', 'wallet', 'customers', 11);

-- The two new roles ---------------------------------------------------------------
-- Slotted next to Sales Team rather than appended, so the list reads as a team
-- rather than as the order somebody happened to add them in.
update public.roles set sort_order = sort_order + 2 where sort_order >= 3;

insert into public.roles (key, name, description, sort_order) values
  ('sales_supervisor', 'Sale Supervisor', 'Oversees a sales team and its credit', 3),
  ('sales_manager',    'Sale Manager',    'Runs the sales function',              4);

insert into public.role_views (role_id, view_key, sort_order)
select r.id, 'sales', 1
from public.roles r
where r.key in ('sales_supervisor', 'sales_manager');

-- The same reach as Sales Team, to begin with. A supervisor overseeing reps
-- probably wants 'sub' where this says 'own', but that is a decision about how
-- HIG is organised rather than one to make in a migration, and the Roles screen
-- is where it belongs.
insert into public.role_permissions (role_id, module_key, action, scope)
select r.id, rp.module_key, rp.action, rp.scope
from public.roles r
cross join (
  select module_key, action, scope
  from public.role_permissions
  where role_id = (select id from public.roles where key = 'sales')
) rp
where r.key in ('sales_supervisor', 'sales_manager');

-- Who may move a credit limit ------------------------------------------------------
insert into public.role_permissions (role_id, module_key, action, scope)
select r.id, 'customer_credit', 'edit'::public.permission_action, 'any'::public.permission_scope
from public.roles r
where r.key in ('system_admin', 'accounting', 'sales_supervisor', 'sales_manager');

-- The guard --------------------------------------------------------------------
-- Invoker rather than definer: it reads nothing but the row in front of it, and
-- app.can does its own elevating.
create function public.guard_credit_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Nobody is signed in: a migration, a script, or anything holding the service
  -- role. This guard is about which *people* may move a limit, and none of
  -- those callers is a person — they already bypass row level security
  -- entirely, so refusing them here would protect nothing and would break an
  -- ordinary data fix. `anon` cannot reach this table at all; 0011 took its
  -- access to the schema away.
  if auth.uid() is null then
    return new;
  end if;

  if app.can('customer_credit', 'edit') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Taking the default is not setting a limit, and a rep must be able to
    -- create a shop. Anything other than the default is a decision, and needs
    -- the permission to make it.
    if new.credit_limit_usd is distinct from app.default_credit_limit() then
      raise exception
        'Changing a credit limit needs the Customer Credit Limit permission'
        using errcode = 'insufficient_privilege';
    end if;
  elsif new.credit_limit_usd is distinct from old.credit_limit_usd then
    -- An ordinary edit sends the field back unchanged, which lands here and
    -- passes. Only a real move is refused.
    raise exception
      'Changing a credit limit needs the Customer Credit Limit permission'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger customers_guard_credit_limit
  before insert or update of credit_limit_usd on public.customers
  for each row execute function public.guard_credit_limit();

-- Callable only as a trigger, as 0023 established for the others.
revoke execute on function public.guard_credit_limit()
  from public, anon, authenticated, service_role;
