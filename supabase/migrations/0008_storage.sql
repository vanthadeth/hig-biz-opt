-- 0008_storage
-- Private bucket for profile pictures. The column exists from 0002; the upload
-- UI arrives with the User module.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars', 'avatars', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

-- Objects are stored under "<user_id>/<filename>", so the owning employee is the
-- first path segment.
create policy avatars_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or app.can('user', 'view', ((storage.foldername(name))[1])::uuid)
    )
  );

create policy avatars_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or app.can('user', 'edit', ((storage.foldername(name))[1])::uuid)
    )
  );

create policy avatars_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or app.can('user', 'edit', ((storage.foldername(name))[1])::uuid)
    )
  );

create policy avatars_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or app.can('user', 'edit', ((storage.foldername(name))[1])::uuid)
    )
  );
