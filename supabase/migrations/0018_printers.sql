-- 0018_printers
--
-- Where a document goes when somebody prints it.
--
-- HIG prints over email: each device has an address that turns a message into a
-- printed page, so a "printer" here is an address plus enough labelling to tell
-- one from another in a list — which branch, which counter.
--
-- These are organisation settings rather than personal ones, so they live in one
-- table gated by the settings module, not per user.

create table public.printers (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  eprint_address text not null,
  location    text,
  is_default  boolean not null default false,
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint printers_label_ck check (btrim(label) <> ''),
  -- Not full RFC validation, which nothing sensible does in a CHECK. This
  -- catches the paste that dropped half the address.
  constraint printers_eprint_address_ck check (eprint_address ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

create unique index printers_eprint_address_unique
  on public.printers (lower(eprint_address));

-- At most one default, enforced rather than merely intended: two rows both
-- claiming to be the default is a bug nobody notices until something prints in
-- the wrong province.
create unique index printers_one_default
  on public.printers ((true))
  where is_default;

create index on public.printers (sort_order);

create trigger printers_set_updated_at
  before update on public.printers
  for each row execute function public.set_updated_at();

-- Row level security ----------------------------------------------------------
-- Anyone signed in needs to read them, because anyone may need to print. Only
-- the settings module may change them.
alter table public.printers enable row level security;

create policy printers_select on public.printers
  for select to authenticated
  using (true);

create policy printers_write on public.printers
  for all to authenticated
  using (app.can('settings', 'edit'))
  with check (app.can('settings', 'edit'));

grant select on public.printers to authenticated;
grant insert, update, delete on public.printers to authenticated;

-- Promoting a default ---------------------------------------------------------
-- The partial unique index above means clearing the old default and setting the
-- new one cannot be two round trips from the browser: whichever lands first
-- would collide. This does both in one statement, under the same policy.
create function public.set_default_printer(p_printer uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.printers set is_default = false
   where is_default and id <> p_printer;

  update public.printers set is_default = true
   where id = p_printer;

  -- Zero rows means one of two things, and this function cannot tell them
  -- apart: the id is wrong, or the caller lacks settings.edit and the policy's
  -- USING clause hid the row from the update. Saying only "no such printer"
  -- would send someone hunting for a data problem that is really a permission.
  if not found then
    raise exception 'That printer does not exist, or you may not change it'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

grant execute on function public.set_default_printer(uuid) to authenticated;
revoke execute on function public.set_default_printer(uuid) from public;
