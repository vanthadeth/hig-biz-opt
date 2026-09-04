-- 0033_module_groups
--
-- The bottom bar's fifth slot stops being a "More" sheet holding whatever did
-- not fit, and becomes a Menu page listing everything the view offers. A sheet
-- of leftovers is a different thing from a menu: one is an apology for running
-- out of room, the other is where you go to find something.
--
-- A menu needs headings, so a module now says which group it belongs to. That
-- belongs in the registry beside its name, icon and href, for the same reason
-- those do — the navigation is data-driven, and a grouping hard-coded in the
-- client would drift from a registry somebody can edit.
--
-- Group order is not stored. It falls out of the module sort order already
-- curated here: a group sits where its first module sits. One less column to
-- keep consistent, and a new module cannot land in a group that sorts
-- somewhere surprising without also sorting there itself.

alter table public.modules
  add column group_name text not null default 'More';

alter table public.modules
  add constraint modules_group_name_ck check (btrim(group_name) <> '');

update public.modules set group_name = case key
  when 'user'            then 'People'
  when 'role_permission' then 'People'
  when 'customer'        then 'Selling'
  when 'customer_credit' then 'Selling'
  when 'sale_order'      then 'Selling'
  when 'product'         then 'Stock'
  when 'inventory'       then 'Stock'
  when 'invoice'         then 'Money'
  when 'payment'         then 'Money'
  when 'audit_log'       then 'System'
  when 'settings'        then 'System'
  else group_name
end;

-- The navigation function carries it through -------------------------------------
-- A function's result columns cannot be added by replacing it, so both of these
-- are dropped and rebuilt. public.my_nav depends on app.my_nav, so it goes first.
drop function public.my_nav(text);
drop function app.my_nav(text);

create function app.my_nav(p_view text)
returns table (
  module_key text,
  name text,
  icon text,
  href text,
  sort_order integer,
  group_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.key, m.name, m.icon, m.href, vm.sort_order, m.group_name
  from public.view_modules vm
  join public.modules m on m.key = vm.module_key
  where vm.view_key = p_view
    and m.active
    and exists (select 1 from app.my_views() mv where mv.key = p_view)
    and app.can(m.key, 'view')
  order by vm.sort_order, m.name;
$$;

create function public.my_nav(p_view text)
returns table (
  module_key text,
  name text,
  icon text,
  href text,
  sort_order integer,
  group_name text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from app.my_nav(p_view);
$$;

grant execute on function app.my_nav(text) to authenticated;
grant execute on function public.my_nav(text) to authenticated;
