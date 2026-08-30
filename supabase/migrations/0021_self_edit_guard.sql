-- 0021_self_edit_guard
--
-- A hole worth naming plainly. The update policy in 0006 reads:
--
--     using (id = auth.uid() or app.can('user', 'edit', id))
--
-- so every signed-in employee could change every column of their own row. The
-- app never offered it, but the row is reachable over PostgREST with nothing but
-- a session, which means any employee could set their own role_id to the system
-- administrator's — or flip is_super_admin — and grant themselves the company.
--
-- Row level security decides which *rows* you may touch, not which columns, and
-- column privileges are granted to a database role rather than per policy, so
-- neither can express "your own row, but only these three fields". A trigger
-- can.
--
-- The three are the ones that are genuinely yours to say: what people call you,
-- what you look like, and a second number to reach you on. Your name,
-- department, position, role, pay details and employment status are matters of
-- record, changed by someone holding the user module.

create function public.guard_self_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Not a signed-in request at all: a migration, the signup trigger re-keying a
  -- record, or an administrative fix run directly against the database.
  if auth.uid() is null then
    return new;
  end if;

  -- Somebody else's row. The policy already decided whether that is allowed.
  if new.id is distinct from auth.uid() then
    return new;
  end if;

  -- Your own row, but you hold the user module over yourself: an administrator
  -- correcting their own record is doing the same job as correcting anyone's.
  if app.can('user', 'edit', new.id) then
    return new;
  end if;

  if (new.id, new.full_name, new.gender, new.date_of_birth, new.phone_primary,
      new.telegram_id, new.email, new.department_id, new.position, new.manager_id,
      new.employment_date, new.role_id, new.bank_name, new.bank_account_name,
      new.bank_account_number, new.status, new.suspended_from, new.suspended_to,
      new.discharged_date, new.status_note, new.status_changed_by,
      new.is_super_admin, new.must_change_password)
     is distinct from
     (old.id, old.full_name, old.gender, old.date_of_birth, old.phone_primary,
      old.telegram_id, old.email, old.department_id, old.position, old.manager_id,
      old.employment_date, old.role_id, old.bank_name, old.bank_account_name,
      old.bank_account_number, old.status, old.suspended_from, old.suspended_to,
      old.discharged_date, old.status_note, old.status_changed_by,
      old.is_super_admin, old.must_change_password)
  then
    raise exception
      'You may only change your own nickname, photo and secondary phone number'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

-- Named to sort before users_stamp_status, so a self-edit is refused before
-- anything downstream starts rewriting the row.
create trigger users_guard_self_edit
  before update on public.users
  for each row execute function public.guard_self_edit();

-- As 0012: a trigger function is not API surface.
revoke execute on function public.guard_self_edit() from public;
