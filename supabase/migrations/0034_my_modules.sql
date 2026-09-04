-- 0034_my_modules
--
-- The Menu page listed the current view's modules. That is what a *navigation*
-- bar should show — a view is a deliberate grouping, and the bar belongs to the
-- view you are in — but it is not what a menu is for. Somebody who holds the
-- Audit Log and is standing in the Sale view should be able to find it, and
-- looking for it in the bar of a view that does not carry it is exactly the
-- moment they conclude the app cannot do it.
--
-- So this adds a second question, kept separate from my_nav rather than folded
-- into it:
--
--   app.my_nav(view)     — what this view offers. Drives the bars.
--   app.my_modules(view) — everything this person can reach, wherever it is
--                          filed. Drives the menu.
--
-- Each row carries the view to enter it through, so a link from the menu lands
-- somewhere the shell is coherent: the bar, the title and the quick actions all
-- belong to a view that actually contains the module. The current view wins
-- when it holds the module, so the common case does not send anybody through a
-- view switch they did not ask for.
--
-- A module in no view the caller may enter is left out. There would be nowhere
-- to send them, and a menu row that cannot lead anywhere is worse than a
-- missing one. That also keeps permission-only modules — customer_credit, which
-- has no view_modules row at all — off the menu, which is the whole point of
-- having filed it that way.

create function app.my_modules(p_view text)
returns table (
  module_key text,
  name text,
  icon text,
  href text,
  sort_order integer,
  group_name text,
  view_key text,
  view_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.key, m.name, m.icon, m.href, m.sort_order, m.group_name, v.key, v.name
  from public.modules m
  -- CROSS JOIN LATERAL rather than LEFT JOIN: a module with no reachable view
  -- drops out here, which is the filter rather than an accident of it.
  cross join lateral (
    select vv.key, vv.name
    from public.view_modules vm
    join app.my_views() vv on vv.key = vm.view_key
    where vm.module_key = m.key
    -- The view they are standing in, if it carries this module; otherwise the
    -- first one they hold that does.
    order by (vv.key = p_view) desc, vv.sort_order
    limit 1
  ) v
  where m.active
    and app.can(m.key, 'view')
  order by m.sort_order, m.name;
$$;

-- PostgREST only exposes `public`, so the frontend calls a thin wrapper there,
-- as the other three do.
create function public.my_modules(p_view text)
returns table (
  module_key text,
  name text,
  icon text,
  href text,
  sort_order integer,
  group_name text,
  view_key text,
  view_name text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from app.my_modules(p_view);
$$;

grant execute on function app.my_modules(text) to authenticated;
grant execute on function public.my_modules(text) to authenticated;
