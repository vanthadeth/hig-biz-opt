-- 0019_user_status_changes
--
-- Suspending and discharging someone is the part of the user record with
-- consequences — pay, access, whether their login still works — so the record
-- of who did it and when should not depend on the client remembering to send
-- it. This stamps it in the database instead.
--
-- It also stops a row from contradicting itself. The CHECK constraints in 0002
-- require dates for a suspension or a discharge, but nothing stopped an
-- *active* row from keeping the dates of a suspension it had come back from.
-- Reinstating someone now clears them.

create function public.stamp_user_status()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at = now();
    -- Null when there is no JWT, which is the case for a migration or an
    -- administrative fix run directly against the database. That is honest:
    -- nobody in `users` made the change.
    new.status_changed_by = auth.uid();

    -- Coming back to active leaves nothing behind to misread later.
    if new.status = 'active' then
      new.suspended_from = null;
      new.suspended_to = null;
      new.discharged_date = null;
    end if;
  end if;

  return new;
end;
$$;

create trigger users_stamp_status
  before update of status on public.users
  for each row execute function public.stamp_user_status();

-- As 0012: a trigger function is not API surface.
revoke execute on function public.stamp_user_status() from public;
