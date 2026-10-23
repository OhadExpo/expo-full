-- #971 (Ohad 24.10: "Use the real logos for the demos. Current seasons logo ... Both logos and icons ... Everywhere where
-- they need to appear (chrome top included)"). The demo clubs are real clubs now; their logos are THEIR artwork, so they
-- are not committed to the public repo - they live here, a public bucket the owner alone writes to (crest, tab icon,
-- share card per club: club-assets/<slug>/...). Public read is the bucket's own (no policy needed for it).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('club-assets', 'club-assets', true, 5242880, array['image/png', 'image/svg+xml', 'image/webp', 'image/jpeg', 'image/x-icon'])
on conflict (id) do nothing;

create policy club_assets_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'club-assets' and public.is_trainer());
create policy club_assets_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'club-assets' and public.is_trainer())
  with check (bucket_id = 'club-assets' and public.is_trainer());
-- an upsert reads the existing row first: the owner can select in the bucket too (the public URL needs no policy)
create policy club_assets_owner_select on storage.objects for select to authenticated
  using (bucket_id = 'club-assets' and public.is_trainer());
