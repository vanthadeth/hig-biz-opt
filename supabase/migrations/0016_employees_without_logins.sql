-- 0016_employees_without_logins
--
-- An employee record and a login are not the same thing.
--
-- public.users.id was a foreign key to auth.users, which meant a person could
-- only exist here if they already had a login. The user model says email is
-- optional, and a warehouse hand with a Telegram ID and no email account is a
-- real case, so that was the wrong constraint: it made "Add new user" a
-- privileged server-side operation for what is really a form.
--
-- After this, `id` is generated. It is still the auth id for anyone who has a
-- login, so `id = auth.uid()` keeps working everywhere and nothing about the
-- access model changes. What changes is the order: a record can exist first and
-- gain a login later.

-- The record no longer depends on an auth account existing --------------------
alter table public.users drop constraint users_id_fkey;
alter table public.users alter column id set default gen_random_uuid();

-- ... but granting a login later re-keys the record to the new auth id, so the
-- four references to users(id) have to follow it.
alter table public.users
  drop constraint users_manager_id_fkey,
  add constraint users_manager_id_fkey
    foreign key (manager_id) references public.users (id)
    on update cascade on delete set null;

alter table public.users
  drop constraint users_status_changed_by_fkey,
  add constraint users_status_changed_by_fkey
    foreign key (status_changed_by) references public.users (id)
    on update cascade on delete set null;

alter table public.user_permission_overrides
  drop constraint user_permission_overrides_user_id_fkey,
  add constraint user_permission_overrides_user_id_fkey
    foreign key (user_id) references public.users (id)
    on update cascade on delete cascade;

alter table public.user_views
  drop constraint user_views_user_id_fkey,
  add constraint user_views_user_id_fkey
    foreign key (user_id) references public.users (id)
    on update cascade on delete cascade;

-- Email is what links a later login to an existing record, so two records must
-- never share one. Case-insensitive, because nobody types their own address the
-- same way twice, and partial because most employees will have no email at all.
create unique index users_email_unique
  on public.users (lower(email))
  where email is not null;

-- Provisioning ----------------------------------------------------------------
-- Signing someone up used to always insert a profile. Now it first looks for a
-- record that is already waiting for them, and adopts it.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role_id  uuid;
  v_existing uuid;
begin
  -- An admin created this person's record before inviting them: keep it, and
  -- move it onto the auth id so their history, manager and overrides come with
  -- them. The foreign keys above cascade the change.
  if new.email is not null then
    select u.id into v_existing
    from public.users u
    where u.email is not null and lower(u.email) = lower(new.email)
    limit 1;
  end if;

  if v_existing is not null then
    if v_existing <> new.id then
      update public.users set id = new.id where id = v_existing;

      -- Avatars are stored under "<user id>/<filename>", so the photo has to be
      -- re-filed or it becomes unreadable to its own owner.
      update storage.objects
         set name = new.id::text || substring(name from position('/' in name))
       where bucket_id = 'avatars'
         and split_part(name, '/', 1) = v_existing::text;
    end if;
    return new;
  end if;

  select id into v_role_id
  from public.roles
  where key = coalesce(new.raw_user_meta_data ->> 'role_key', 'sales')
  limit 1;

  if v_role_id is null then
    select id into v_role_id from public.roles order by sort_order limit 1;
  end if;

  insert into public.users (id, full_name, email, role_id)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    new.email,
    v_role_id
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Same as 0012: being PUBLIC is not a reason to be able to call a trigger.
revoke execute on function public.handle_new_auth_user() from public;
