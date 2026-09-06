-- 0043_cart_customer_discount_and_sale_orders
--
-- The cart grows a head, and orders start existing.
--
-- Until now a cart was a bare set of lines keyed on the person: an empty cart
-- and no cart were the same thing, which was true right up to the moment a cart
-- had to hold something that is not a line. A customer is that something. So
-- there is a header now, and the lines hang off it.
--
-- One cart per person, for the moment. The unique index is the only thing
-- saying so, and lifting it is what "allow multiple carts" will mean — nothing
-- below assumes a person has exactly one.
--
-- The other half is the sale order. A cart is scratch: prices move under it,
-- items go out of the catalogue, quantities get argued about. An order is a
-- record of what was agreed, so confirming a cart copies rather than points:
-- the code, the name and both prices are written into the order line as they
-- were at that moment. Change the item's price tomorrow and the order still
-- says what the shop agreed to pay.

-- The cart's head ---------------------------------------------------------------
create table public.carts (
  id          uuid primary key default gen_random_uuid(),
  -- Defaulted to the caller rather than sent, so a cart cannot be opened in
  -- somebody else's name even by trying. Same shape as 0025's owner.
  user_id     uuid not null references public.users (id) on delete cascade
                default auth.uid(),
  -- Who it is for. Null while somebody is still building it: the customer is
  -- often decided after the shopkeeper has picked things off the screen.
  customer_id uuid references public.customers (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index carts_one_per_person on public.carts (user_id);
create index on public.carts (customer_id);

create trigger carts_set_updated_at
  before update on public.carts
  for each row execute function public.set_updated_at();

alter table public.carts enable row level security;

-- A cart is yours, and there is no version of this where it is not. No module
-- permission appears below, so there is nothing an administrator can grant.
create policy carts_select on public.carts
  for select to authenticated using (user_id = auth.uid());
create policy carts_insert on public.carts
  for insert to authenticated with check (user_id = auth.uid() and app.can('product', 'view'));
create policy carts_update on public.carts
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy carts_delete on public.carts
  for delete to authenticated using (user_id = auth.uid());

revoke all on public.carts from authenticated, anon;
grant select, insert, update, delete on public.carts to authenticated;

comment on table public.carts is
  'One open cart per person. Holds what a cart has that is not a line — the '
  'customer it is being built for. Lifting carts_one_per_person is what '
  'multiple carts will mean.';

-- The lines move onto it --------------------------------------------------------
alter table public.cart_lines
  add column cart_id uuid references public.carts (id) on delete cascade,
  -- Per line, not per order: a rep discounts the slow-moving item, not the
  -- whole basket. Percent rather than an amount because that is what gets
  -- agreed out loud, and because it survives the two currencies without
  -- having to be quoted twice.
  add column discount_percent numeric(5, 2) not null default 0
    constraint cart_lines_discount_ck check (discount_percent >= 0 and discount_percent <= 100);

-- Existing lines belong to whoever holds them; give each of those people a cart
-- and move their lines onto it. Written to survive being run on an empty table.
insert into public.carts (user_id)
select distinct l.user_id from public.cart_lines l
where not exists (select 1 from public.carts c where c.user_id = l.user_id);

update public.cart_lines l
   set cart_id = c.id
  from public.carts c
 where c.user_id = l.user_id and l.cart_id is null;

alter table public.cart_lines
  alter column cart_id set not null;

-- The line's owner is the cart's owner now. Two answers to one question is one
-- answer too many, and the second would eventually disagree.
drop index if exists cart_lines_one_per_item;
drop policy cart_lines_select on public.cart_lines;
drop policy cart_lines_insert on public.cart_lines;
drop policy cart_lines_update on public.cart_lines;
drop policy cart_lines_delete on public.cart_lines;

alter table public.cart_lines drop column user_id;

create unique index cart_lines_one_per_item on public.cart_lines (cart_id, item_id);
create index on public.cart_lines (cart_id);

-- Whose cart a line hangs off. Definer for the reason 0025's customer_owner is:
-- the line's policy needs the cart's owner, and reading it through the cart's
-- own policy would be circular.
create function app.cart_owner(p_cart uuid)
returns uuid language sql stable security definer set search_path = ''
as $$ select c.user_id from public.carts c where c.id = p_cart; $$;

grant execute on function app.cart_owner(uuid) to authenticated;

create policy cart_lines_select on public.cart_lines
  for select to authenticated using (app.cart_owner(cart_id) = auth.uid());
create policy cart_lines_insert on public.cart_lines
  for insert to authenticated
  with check (app.cart_owner(cart_id) = auth.uid() and app.can('product', 'view'));
create policy cart_lines_update on public.cart_lines
  for update to authenticated
  using (app.cart_owner(cart_id) = auth.uid())
  with check (app.cart_owner(cart_id) = auth.uid());
create policy cart_lines_delete on public.cart_lines
  for delete to authenticated using (app.cart_owner(cart_id) = auth.uid());

comment on table public.cart_lines is
  'One row per item per cart. Scratch: prices are read live from the item, and '
  'nothing here is a record of anything until confirm_cart copies it.';

-- Getting one -------------------------------------------------------------------
-- Called when somebody first needs a cart rather than when they open the
-- catalogue: browsing is not the same as starting an order, and a row per
-- person who ever looked at a screen is rubbish nobody asked for.
create function app.ensure_my_cart()
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
begin
  if v_me is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;

  select id into v_id from public.carts where user_id = v_me;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.carts default values returning id into v_id;
  return v_id;
end;
$$;

-- Orders ------------------------------------------------------------------------
-- Two states, and no more invented than that. What happens to an order after it
-- is placed — picked, delivered, invoiced — belongs to the order module when
-- somebody designs it, and guessing at those states now would be guessing.
create type public.sale_order_status as enum ('new', 'cancelled');

-- Shared across years rather than reset, so a number identifies an order for
-- good. The year in the text is for reading, not for uniqueness.
create sequence public.sale_order_no_seq;

create table public.sale_orders (
  id           uuid primary key default gen_random_uuid(),
  order_no     text not null unique,

  -- Who it is for, and who sold it. The customer is required: an order for
  -- nobody cannot be delivered, chased or invoiced.
  customer_id  uuid not null references public.customers (id) on delete restrict,
  -- Who sold it. Nullable and set null when an employee record goes, the same
  -- shape a customer's owner has: losing the person must not lose the order,
  -- and an order with no seller is a house order that anybody holding the
  -- module can see. Defaulted to the caller so it is never sent by a client.
  user_id      uuid references public.users (id) on delete set null default auth.uid(),

  status       public.sale_order_status not null default 'new',

  -- Both currencies, never converted between: HIG prices in both and the rate
  -- is somebody's decision, not this table's. An order of items priced in only
  -- one currency totals in that one alone.
  total_usd    numeric(12, 2),
  total_khr    numeric(14, 0),
  -- What the discounts came to. The subtotal is this plus the total, which is
  -- why it is not a third column that could disagree with the other two.
  discount_usd numeric(12, 2),
  discount_khr numeric(14, 0),

  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index on public.sale_orders (customer_id);
create index on public.sale_orders (user_id);
create index on public.sale_orders (status);
create index on public.sale_orders (created_at desc);

create trigger sale_orders_set_updated_at
  before update on public.sale_orders
  for each row execute function public.set_updated_at();

create table public.sale_order_lines (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.sale_orders (id) on delete cascade,

  -- Kept for "show me this item's orders", and allowed to go null: an item
  -- deleted from the catalogue must not take the record of what was sold with
  -- it. Everything the line needs to read is copied below.
  item_id          uuid references public.items (id) on delete set null,

  -- The snapshot. What the item was called and cost at the moment this was
  -- agreed, so tomorrow's price rise does not rewrite yesterday's order.
  item_code        text,
  item_name        text not null,
  unit_price_usd   numeric(12, 2),
  unit_price_khr   numeric(14, 0),
  discount_percent numeric(5, 2) not null default 0,
  quantity         integer not null,
  line_total_usd   numeric(12, 2),
  line_total_khr   numeric(14, 0),
  sort_order       integer not null default 0,

  constraint sale_order_lines_quantity_ck check (quantity > 0),
  constraint sale_order_lines_discount_ck
    check (discount_percent >= 0 and discount_percent <= 100),
  constraint sale_order_lines_name_ck check (btrim(item_name) <> '')
);

create index on public.sale_order_lines (order_id);
create index on public.sale_order_lines (item_id);

alter table public.sale_orders enable row level security;
alter table public.sale_order_lines enable row level security;

-- The module model, not a bespoke rule: `sale_order` at own / sub / any, keyed
-- on the rep who sold it, exactly as `customer` is keyed on its owner.
create policy sale_orders_select on public.sale_orders
  for select to authenticated using (app.can('sale_order', 'view', user_id));
create policy sale_orders_insert on public.sale_orders
  for insert to authenticated with check (app.can('sale_order', 'add', user_id));
create policy sale_orders_update on public.sale_orders
  for update to authenticated
  using (app.can('sale_order', 'edit', user_id))
  with check (app.can('sale_order', 'edit', user_id));
create policy sale_orders_delete on public.sale_orders
  for delete to authenticated using (app.can('sale_order', 'delete', user_id));

create function app.sale_order_seller(p_order uuid)
returns uuid language sql stable security definer set search_path = ''
as $$ select o.user_id from public.sale_orders o where o.id = p_order; $$;

grant execute on function app.sale_order_seller(uuid) to authenticated;

create policy sale_order_lines_select on public.sale_order_lines
  for select to authenticated
  using (app.can('sale_order', 'view', app.sale_order_seller(order_id)));
create policy sale_order_lines_insert on public.sale_order_lines
  for insert to authenticated
  with check (app.can('sale_order', 'add', app.sale_order_seller(order_id)));
create policy sale_order_lines_update on public.sale_order_lines
  for update to authenticated
  using (app.can('sale_order', 'edit', app.sale_order_seller(order_id)))
  with check (app.can('sale_order', 'edit', app.sale_order_seller(order_id)));
create policy sale_order_lines_delete on public.sale_order_lines
  for delete to authenticated
  using (app.can('sale_order', 'delete', app.sale_order_seller(order_id)));

revoke all on public.sale_orders from authenticated, anon;
revoke all on public.sale_order_lines from authenticated, anon;
grant select, insert, update, delete on public.sale_orders to authenticated;
grant select, insert, update, delete on public.sale_order_lines to authenticated;
grant usage on sequence public.sale_order_no_seq to authenticated;

comment on table public.sale_orders is
  'What a cart became. Totals are stored rather than derived, because the '
  'prices they were computed from are free to change afterwards.';
comment on table public.sale_order_lines is
  'A copy, not a pointer: code, name and both prices as they were when the '
  'order was agreed. item_id is a convenience and may go null.';

-- Confirming --------------------------------------------------------------------
-- Security invoker on purpose. The insert goes through the sale_orders policy,
-- so a person without `sale_order.add` cannot place an order by calling this —
-- a definer function here would be a hole shaped exactly like the permission it
-- was meant to respect.
create function app.confirm_cart()
returns public.sale_orders
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_me       uuid := auth.uid();
  v_cart     public.carts;
  v_order    public.sale_orders;
  v_lines    integer;
begin
  if v_me is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;

  select * into v_cart from public.carts where user_id = v_me;
  if not found then
    raise exception 'There is no cart to confirm' using errcode = 'no_data_found';
  end if;

  if v_cart.customer_id is null then
    raise exception 'Choose a customer before confirming the cart'
      using errcode = 'check_violation';
  end if;

  select count(*) into v_lines from public.cart_lines where cart_id = v_cart.id;
  if v_lines = 0 then
    raise exception 'There is nothing in the cart' using errcode = 'check_violation';
  end if;

  insert into public.sale_orders (order_no, customer_id, user_id)
  values (
    'SO-' || to_char(now(), 'YY') || '-'
          || lpad(nextval('public.sale_order_no_seq')::text, 5, '0'),
    v_cart.customer_id,
    v_me
  )
  returning * into v_order;

  -- The copy. Prices are read from the item here and never read again.
  insert into public.sale_order_lines (
    order_id, item_id, item_code, item_name,
    unit_price_usd, unit_price_khr, discount_percent, quantity,
    line_total_usd, line_total_khr, sort_order
  )
  select
    v_order.id, i.id, i.code, i.name,
    i.price_usd, i.price_khr, l.discount_percent, l.quantity,
    round(i.price_usd * l.quantity * (1 - l.discount_percent / 100), 2),
    round(i.price_khr * l.quantity * (1 - l.discount_percent / 100), 0),
    row_number() over (order by i.code nulls last, i.name)
  from public.cart_lines l
  join public.items i on i.id = l.item_id
  where l.cart_id = v_cart.id;

  update public.sale_orders o
     set total_usd = t.total_usd,
         total_khr = t.total_khr,
         discount_usd = t.discount_usd,
         discount_khr = t.discount_khr
    from (
      select
        sum(line_total_usd) as total_usd,
        sum(line_total_khr) as total_khr,
        sum(round(unit_price_usd * quantity * discount_percent / 100, 2)) as discount_usd,
        sum(round(unit_price_khr * quantity * discount_percent / 100, 0)) as discount_khr
      from public.sale_order_lines where order_id = v_order.id
    ) t
   where o.id = v_order.id
  returning o.* into v_order;

  -- The cart is emptied rather than deleted: the rep is still standing in the
  -- same shop, and the next order is usually for the same customer.
  delete from public.cart_lines where cart_id = v_cart.id;

  return v_order;
end;
$$;

-- The doorways ------------------------------------------------------------------
-- PostgREST only exposes `public`, so an `app.` function nothing can call is a
-- function that does not exist as far as the app is concerned.
create function public.ensure_my_cart()
returns uuid language sql security invoker set search_path = ''
as $$ select app.ensure_my_cart(); $$;

create function public.confirm_cart()
returns public.sale_orders language sql security invoker set search_path = ''
as $$ select app.confirm_cart(); $$;

revoke all on function app.ensure_my_cart() from public, anon;
revoke all on function app.confirm_cart() from public, anon;
revoke all on function public.ensure_my_cart() from public, anon;
revoke all on function public.confirm_cart() from public, anon;

grant execute on function app.ensure_my_cart() to authenticated;
grant execute on function app.confirm_cart() to authenticated;
grant execute on function public.ensure_my_cart() to authenticated;
grant execute on function public.confirm_cart() to authenticated;

notify pgrst, 'reload schema';
