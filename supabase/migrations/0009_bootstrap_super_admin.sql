-- 0009_bootstrap_super_admin
-- The first account, so there is someone who can create everyone else. The
-- profile row is created by the 0002 trigger; this only adds the login and
-- promotes it.
--
-- NOTE: the copy applied to the live project substituted a generated password
-- for the placeholder below, delivered to the account holder out of band and
-- never committed. Replace the placeholder before running this anywhere else,
-- and change it from the Supabase dashboard afterwards
-- (Authentication -> Users -> the account -> Reset password).

do $$
declare
  v_id uuid := gen_random_uuid();
begin
  if exists (select 1 from auth.users where email = 'vantha.deth@gmail.com') then
    return;
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    'vantha.deth@gmail.com',
    extensions.crypt('REPLACE_WITH_A_GENERATED_PASSWORD', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Vantha Deth","role_key":"system_admin"}'::jsonb,
    now(), now(), '', '', '', ''
  );

  -- Without a matching identity row the email provider will not sign the
  -- account in, even though the password is correct.
  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    v_id, v_id,
    jsonb_build_object(
      'sub', v_id::text, 'email', 'vantha.deth@gmail.com',
      'email_verified', true, 'phone_verified', false
    ),
    'email', now(), now(), now()
  );

  update public.users
     set is_super_admin = true,
         must_change_password = true,
         department_id = (select id from public.departments where name = 'Sales'),
         position = 'Managing Director',
         employment_date = current_date
   where id = v_id;
end;
$$;
