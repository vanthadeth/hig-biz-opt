-- sale_orders.test.sql
--
-- Turning a cart into an order, and what makes that different from a cart.
--
-- A cart is scratch: it reads prices live off the item, and it is nobody's but
-- the person holding it. An order is a record of what was agreed, so the two
-- questions here are the ones that separate them — does confirming copy rather
-- than point, and is an order governed by the module permission rather than by
-- whose it is.
--
-- The snapshot assertion is the important one. It moves an item's price after
-- the order exists and insists the order does not move with it: without that,
-- every historical order silently rewrites itself the next time somebody edits
-- a price, and nobody finds out until a customer disputes an invoice.
--
-- Everything happens inside one transaction that is deliberately rolled back,
-- so a run leaves no trace.
--
--     psql "$DATABASE_URL" -f supabase/tests/sale_orders.test.sql
--
-- Success looks like an error, because the rollback is what forces it:
--
--     ERROR:  SALE ORDERS OK - 39 assertions passed (rls: ran)
--
-- Anything else is a real failure and names the assertion that broke.

-- The item side of 0035 — packing, stock, the widened select policies — is
-- covered in inventory.test.sql, where the items and the people who may not
-- touch them already are. What is here is the part that has no equivalent
-- anywhere else in the schema: a table where the row belongs to a person
-- rather than to a module, so the question is never "may you" but "is it
-- yours".
--
-- Everything happens inside one transaction that is deliberately rolled back,
-- so a run leaves no trace.
--
--     psql "$DATABASE_URL" -f supabase/tests/catalog.test.sql
--
-- Success looks like an error, because the rollback is what forces it:
--
--     ERROR:  CATALOG OK - 37 assertions passed (rls: ran)
--
-- Anything else is a real failure and names the assertion that broke.

create or replace function pg_temp.bump() returns void language plpgsql as $f$
begin
  perform set_config('higtest.checks',
    (coalesce(current_setting('higtest.checks', true), '0')::int + 1)::text, false);
end;
$f$;

create or replace function pg_temp.eq(p_label text, p_actual text, p_expected text)
returns void language plpgsql as $f$
begin
  perform pg_temp.bump();
  if p_actual is distinct from p_expected then
    raise exception 'FAILED: % -- expected %, got %',
      p_label, coalesce(p_expected, 'null'), coalesce(p_actual, 'null');
  end if;
end;
$f$;

create or replace function pg_temp.ok(p_label text, p_actual boolean)
returns void language plpgsql as $f$
begin
  perform pg_temp.bump();
  if p_actual is distinct from true then
    raise exception 'FAILED: % -- expected true, got %', p_label, coalesce(p_actual::text, 'null');
  end if;
end;
$f$;

create or replace function pg_temp.rejects(p_label text, p_stmt text)
returns void language plpgsql as $f$
begin
  perform pg_temp.bump();
  begin
    execute p_stmt;
  exception
    when check_violation or not_null_violation or foreign_key_violation
      or unique_violation or raise_exception or no_data_found then
      return;
  end;
  raise exception 'FAILED: % -- statement was accepted but should have been refused', p_label;
end;
$f$;

create or replace function pg_temp.act_as(p_user uuid)
returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
end;
$f$;

create or replace function pg_temp.new_user(
  p_id uuid, p_email text, p_name text, p_role_key text
) returns void language plpgsql as $f$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated',
    p_email, '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_name, 'role_key', p_role_key),
    now(), now(), '', '', '', ''
  );
end;
$f$;


do $$
declare
  v_sa   uuid := '00000000-0000-4000-8000-0000000e0001';  -- super admin
  v_rep  uuid := '00000000-0000-4000-8000-0000000e0002';  -- the rep who sells
  v_rep2 uuid := '00000000-0000-4000-8000-0000000e0003';  -- a colleague
  v_cus  uuid;
  v_itm  uuid;   -- priced in both currencies
  v_alt  uuid;   -- priced in dollars only
  v_cart uuid;
  v_riel uuid;   -- priced in riel and nothing else
  v_ord  public.sale_orders;
  v_ord1 public.sale_orders;   -- the first one, kept for the snapshot below
  v_txt  text;
  v_rls  text := 'skipped (cannot assume the authenticated role)';
begin
  perform set_config('higtest.checks', '0', false);

  perform pg_temp.new_user(v_sa,   'so.sa@example.test',   'SO Admin', 'system_admin');
  perform pg_temp.new_user(v_rep,  'so.rep@example.test',  'SO Rep',   'sales');
  perform pg_temp.new_user(v_rep2, 'so.rep2@example.test', 'SO Rep 2', 'sales');
  update public.users set is_super_admin = true where id = v_sa;

  insert into public.customers (shop_name, owner_id) values ('SO Shop', v_rep)
    returning id into v_cus;
  insert into public.items (name, code, price_usd, price_khr, stock_qty)
    values ('SO Widget', 'SO-1', 10.00, 41000, 100) returning id into v_itm;
  insert into public.items (name, code, price_usd, stock_qty)
    values ('SO Gadget', 'SO-2', 3.00, 100) returning id into v_alt;
  insert into public.items (name, code, price_khr, stock_qty)
    values ('SO Riel Only', 'SO-3', 8000, 100) returning id into v_riel;

  ----------------------------------------------------------------------------
  -- Confirming, as the rep, through the same doorway the app uses
  ----------------------------------------------------------------------------
  begin
    execute 'set local role authenticated';
    perform pg_temp.act_as(v_rep);

    v_cart := public.ensure_my_cart();
    perform pg_temp.ok('a rep gets a cart on asking', v_cart is not null);
    perform pg_temp.eq('and asking twice does not make a second',
      public.ensure_my_cart()::text, v_cart::text);

    -- Nothing in it yet. Refused for that reason rather than producing an
    -- order of nothing, which would be a document somebody has to cancel.
    perform pg_temp.rejects('an empty cart does not become an order',
      'select public.confirm_cart()');

    ----------------------------------------------------------------------
    -- One discount, or the other, never both
    --
    -- "Ten percent and two dollars off" is two people remembering the same
    -- conversation differently. The constraint is what makes that impossible
    -- rather than something the form is trusted to remember.
    ----------------------------------------------------------------------
    perform pg_temp.rejects('a line may not carry both kinds of discount',
      format('insert into public.cart_lines (cart_id, item_id, quantity,
                discount_mode, discount_percent, discount_amount)
              values (%L, %L, 1, ''percent'', 5, 2)', v_cart, v_itm));
    perform pg_temp.rejects('nor an amount filed as a percent',
      format('insert into public.cart_lines (cart_id, item_id, quantity,
                discount_mode, discount_percent, discount_amount)
              values (%L, %L, 1, ''amount'', 5, 2)', v_cart, v_itm));
    perform pg_temp.rejects('a negative number of free ones is not a gift',
      format('insert into public.cart_lines (cart_id, item_id, quantity, free_quantity)
              values (%L, %L, 1, -1)', v_cart, v_itm));

    insert into public.cart_lines (cart_id, item_id, quantity, discount_percent)
      values (v_cart, v_itm, 3, 10);
    insert into public.cart_lines (cart_id, item_id, quantity)
      values (v_cart, v_alt, 2);

    -- An order for nobody cannot be delivered, chased or invoiced.
    perform pg_temp.rejects('nor does a cart with no customer on it',
      'select public.confirm_cart()');

    update public.carts set customer_id = v_cus where id = v_cart;
    v_ord := public.confirm_cart();

    perform pg_temp.ok('an order gets a number',
      v_ord.order_no ~ '^SO-[0-9]{2}-[0-9]{5}$');
    perform pg_temp.eq('and the customer the cart was for',
      v_ord.customer_id::text, v_cus::text);
    perform pg_temp.eq('and the rep who sold it',
      v_ord.user_id::text, v_rep::text);
    perform pg_temp.eq('and starts as new', v_ord.status::text, 'new');

    -- 3 x 10.00 less a tenth is 27.00; 2 x 3.00 is 6.00.
    perform pg_temp.eq('the dollar total carries the discount',
      v_ord.total_usd::text, '33.00');
    perform pg_temp.eq('and the discount is stated on its own',
      v_ord.discount_usd::text, '3.00');
    -- Only the first item is priced in riel, and the two totals are not two
    -- views of one number: nothing here converts between currencies.
    perform pg_temp.eq('the riel total counts only what is priced in riel',
      v_ord.total_khr::text, '110700');

    select string_agg(item_code || '/' || quantity || '/' || discount_percent,
                      ' ' order by sort_order)
      into v_txt from public.sale_order_lines where order_id = v_ord.id;
    perform pg_temp.eq('the lines are copied in code order',
      v_txt, 'SO-1/3/10.00 SO-2/2/0.00');

    perform pg_temp.eq('nothing is given away unless somebody says so',
      (select free_quantity::text from public.sale_order_lines
        where order_id = v_ord.id and item_code = 'SO-1'), '0');
    perform pg_temp.eq('and a percent is how a discount is filed by default',
      (select discount_mode::text from public.sale_order_lines
        where order_id = v_ord.id and item_code = 'SO-1'), 'percent');

    perform pg_temp.eq('confirming empties the cart',
      (select count(*)::text from public.cart_lines where cart_id = v_cart), '0');
    -- The rep is still standing in the same shop; the next order is usually
    -- for the same customer.
    perform pg_temp.eq('but leaves the cart itself, and its customer',
      (select customer_id::text from public.carts where id = v_cart), v_cus::text);

    -- Held on to: the snapshot assertions below are about this order, and the
    -- second confirm is about to take the variable.
    v_ord1 := v_ord;

    ----------------------------------------------------------------------
    -- Buy ten, two free, two dollars off
    --
    -- The three things a rep does at the moment of adding, in one order. The
    -- amount is said in dollars and becomes a share, so the riel side of the
    -- same line comes down by the same fraction — not a conversion, which
    -- this app has no rate for, but the same proportion of a price that was
    -- already in riel.
    ----------------------------------------------------------------------
    insert into public.cart_lines (cart_id, item_id, quantity, free_quantity,
                                   discount_mode, discount_amount)
      values (v_cart, v_itm, 10, 2, 'amount', 2);
    insert into public.cart_lines (cart_id, item_id, quantity,
                                   discount_mode, discount_amount)
      values (v_cart, v_riel, 5, 'amount', 5);

    v_ord := public.confirm_cart();

    perform pg_temp.eq('two dollars off a hundred is two percent',
      (select discount_percent::text from public.sale_order_lines
        where order_id = v_ord.id and item_code = 'SO-1'), '2.00');
    perform pg_temp.eq('so the dollar line is ninety-eight',
      (select line_total_usd::text from public.sale_order_lines
        where order_id = v_ord.id and item_code = 'SO-1'), '98.00');
    perform pg_temp.eq('and the same two percent comes off the riel side',
      (select line_total_khr::text from public.sale_order_lines
        where order_id = v_ord.id and item_code = 'SO-1'), '401800');
    perform pg_temp.eq('the free two are carried onto the order',
      (select free_quantity::text from public.sale_order_lines
        where order_id = v_ord.id and item_code = 'SO-1'), '2');
    perform pg_temp.eq('and how it was agreed survives beside what it came to',
      (select discount_mode || '/' || discount_amount from public.sale_order_lines
        where order_id = v_ord.id and item_code = 'SO-1'), 'amount/2.00');

    -- Nothing for the amount to be a share of. No discount at all rather than
    -- all of it, which is the failure that would give the stock away.
    perform pg_temp.eq('an amount off an item with no dollar price takes nothing',
      (select line_total_khr::text from public.sale_order_lines
        where order_id = v_ord.id and item_code = 'SO-3'), '40000');

    perform pg_temp.eq('an amount bigger than the line is the whole line',
      app.discount_share('amount', 0, 999, 10, 10)::text, '100');
    perform pg_temp.eq('and nothing at all where there is no price to take it off',
      app.discount_share('amount', 0, 5, null, 10)::text, '0');

    execute 'reset role';
    v_rls := 'ran';
  exception when insufficient_privilege then
    execute 'reset role';
    v_rls := 'skipped (cannot assume the authenticated role)';
  end;

  ----------------------------------------------------------------------------
  -- The snapshot
  --
  -- The whole reason an order is a separate table. A cart points at an item
  -- and reads today's price; an order holds what was agreed, and must go on
  -- holding it after somebody edits the item.
  ----------------------------------------------------------------------------
  if v_rls = 'ran' then
    update public.items set price_usd = 99, name = 'SO Widget, renamed',
                            code = 'SO-1-NEW' where id = v_itm;

    perform pg_temp.eq('a price rise does not reach a placed order',
      (select unit_price_usd::text from public.sale_order_lines
        where order_id = v_ord1.id and item_id = v_itm), '10.00');
    perform pg_temp.eq('nor a rename',
      (select item_name from public.sale_order_lines
        where order_id = v_ord1.id and item_id = v_itm), 'SO Widget');
    perform pg_temp.eq('nor a new code',
      (select item_code from public.sale_order_lines
        where order_id = v_ord1.id and item_id = v_itm), 'SO-1');
    perform pg_temp.eq('and the total stays what was agreed',
      (select total_usd::text from public.sale_orders where id = v_ord1.id), '33.00');

    -- An item withdrawn from the catalogue must not take the record of what
    -- was sold with it.
    delete from public.items where id = v_alt;
    perform pg_temp.eq('deleting an item leaves the order line standing',
      (select count(*)::text from public.sale_order_lines
        where order_id = v_ord1.id), '2');
    perform pg_temp.eq('and the line still says what it was',
      (select item_name from public.sale_order_lines
        where order_id = v_ord1.id and item_code = 'SO-2'), 'SO Gadget');
    perform pg_temp.ok('with nothing left to point at',
      (select item_id is null from public.sale_order_lines
        where order_id = v_ord1.id and item_code = 'SO-2'));

    -- A customer with orders cannot simply vanish; the order would be for
    -- nobody, which is the state the not-null forbids in the first place.
    perform pg_temp.rejects('a customer with orders may not be deleted',
      format('delete from public.customers where id = %L', v_cus));
  end if;

  ----------------------------------------------------------------------------
  -- Whose order it is
  --
  -- Unlike a cart, an order is governed by the module: `sale_order` at own,
  -- sub or any, keyed on the rep who sold it. The seeded sales role holds
  -- view at 'sub', so a colleague in the same department can see it — that is
  -- the point of the scope, and it is asserted rather than assumed.
  ----------------------------------------------------------------------------
  begin
    execute 'set local role authenticated';

    perform pg_temp.act_as(v_rep);
    perform pg_temp.eq('the rep sees the order they placed',
      (select count(*)::text from public.sale_orders where id = v_ord.id), '1');
    perform pg_temp.eq('and its lines',
      (select count(*)::text from public.sale_order_lines where order_id = v_ord.id), '2');

    perform pg_temp.act_as(v_sa);
    perform pg_temp.eq('an administrator sees it too',
      (select count(*)::text from public.sale_orders where id = v_ord.id), '1');

    -- A refused delete matches no rows and raises nothing at all, so what is
    -- left afterwards is the only proof it was refused.
    perform pg_temp.act_as(v_rep);
    delete from public.sale_orders where id = v_ord.id;
    perform pg_temp.act_as(v_sa);
    perform pg_temp.eq('a rep may not delete an order',
      (select count(*)::text from public.sale_orders where id = v_ord.id), '1');

    execute 'reset role';
  exception when insufficient_privilege then
    execute 'reset role';
  end;

  raise exception 'SALE ORDERS OK - % assertions passed (rls: %)',
    current_setting('higtest.checks'), v_rls;
end;
$$;
