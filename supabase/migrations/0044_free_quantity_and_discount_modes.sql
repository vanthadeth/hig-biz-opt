-- 0044_free_quantity_and_discount_modes
--
-- Three things a rep does at the moment of adding, that the cart could not
-- hold: give some away, discount in money rather than in percent, and do
-- exactly one of those two.
--
-- FREE QUANTITY. "Buy ten, two free" is a deal made in the shop, not a
-- promotion configured in an office, so it is a number on the line rather than
-- a rule somewhere else. The free ones are not charged and are not discounted:
-- they are given. They still leave the warehouse, which is why they count
-- against stock and why the order line carries them — a picker packing twelve
-- against an order that says ten is a dispute waiting to happen.
--
-- DISCOUNT, ONE WAY OR THE OTHER. A percent, or an amount off the line, and
-- never both: "10% and $2 off" is two people remembering the conversation
-- differently. The check constraint is what makes that true rather than a rule
-- the form is trusted to keep.
--
-- The amount is in dollars, because that is the currency a discount gets said
-- in. It is stored as what was said, and turned into a proportion when the line
-- is priced, so the riel side of the same line comes down by the same share.
-- That is not a conversion between currencies — this app does not have a rate
-- and will not invent one — it is the same fraction applied to both prices.
-- An item with no dollar price has nothing to take an amount off, so the app
-- offers only a percent there.

create type public.discount_mode as enum ('percent', 'amount');

alter table public.cart_lines
  add column free_quantity integer not null default 0
    constraint cart_lines_free_ck check (free_quantity >= 0),
  add column discount_mode public.discount_mode not null default 'percent',
  add column discount_amount numeric(12, 2) not null default 0
    constraint cart_lines_discount_amount_ck check (discount_amount >= 0);

-- Only one of them applies, and the unused one is zero rather than merely
-- ignored. A row that carries both values is a row somebody will later read
-- the wrong half of.
alter table public.cart_lines
  add constraint cart_lines_one_discount_ck check (
    (discount_mode = 'percent' and discount_amount = 0)
    or (discount_mode = 'amount' and discount_percent = 0)
  );

alter table public.sale_order_lines
  add column free_quantity integer not null default 0
    constraint sale_order_lines_free_ck check (free_quantity >= 0),
  add column discount_mode public.discount_mode not null default 'percent',
  add column discount_amount numeric(12, 2) not null default 0
    constraint sale_order_lines_discount_amount_ck check (discount_amount >= 0);

comment on column public.cart_lines.free_quantity is
  'Given, not sold. Not charged and not discounted, but off the shelf all the '
  'same, which is why the order line carries it.';
comment on column public.sale_order_lines.discount_percent is
  'What the discount came to as a share of the line, whichever way it was '
  'entered. The maths is here; discount_mode and discount_amount say how it '
  'was agreed.';

-- What a discount comes to, as a share -------------------------------------------
-- One place, because the cart screen, the order and any report of either have
-- to agree about it, and three implementations of a division would not.
create function app.discount_share(
  p_mode public.discount_mode,
  p_percent numeric,
  p_amount numeric,
  p_unit_price numeric,
  p_quantity integer
) returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_mode = 'percent' then coalesce(p_percent, 0)
    -- Nothing to take it off: no price, or nothing being bought. Not an error
    -- and not a hundred percent off — no discount at all.
    when coalesce(p_unit_price, 0) = 0 or coalesce(p_quantity, 0) = 0 then 0
    -- Capped: an amount larger than the line is the whole line, not a refund.
    else least(100, coalesce(p_amount, 0) / (p_unit_price * p_quantity) * 100)
  end;
$$;

grant execute on function app.discount_share(
  public.discount_mode, numeric, numeric, numeric, integer) to authenticated;

-- Confirming, now carrying all of it ---------------------------------------------
create or replace function app.confirm_cart()
returns public.sale_orders
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_me    uuid := auth.uid();
  v_cart  public.carts;
  v_order public.sale_orders;
  v_lines integer;
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

  -- The copy. Prices are read from the item here and never read again, and the
  -- share is worked out here too: a percent typed as dollars must not have to
  -- be re-divided by every screen that later reads the order.
  insert into public.sale_order_lines (
    order_id, item_id, item_code, item_name,
    unit_price_usd, unit_price_khr,
    discount_mode, discount_amount, discount_percent,
    quantity, free_quantity,
    line_total_usd, line_total_khr, sort_order
  )
  select
    v_order.id, i.id, i.code, i.name,
    i.price_usd, i.price_khr,
    l.discount_mode, l.discount_amount,
    round(app.discount_share(l.discount_mode, l.discount_percent, l.discount_amount,
                             i.price_usd, l.quantity), 2),
    l.quantity, l.free_quantity,
    round(i.price_usd * l.quantity
          * (1 - app.discount_share(l.discount_mode, l.discount_percent,
                                    l.discount_amount, i.price_usd, l.quantity) / 100), 2),
    round(i.price_khr * l.quantity
          * (1 - app.discount_share(l.discount_mode, l.discount_percent,
                                    l.discount_amount, i.price_usd, l.quantity) / 100), 0),
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

  delete from public.cart_lines where cart_id = v_cart.id;

  return v_order;
end;
$$;

notify pgrst, 'reload schema';
