begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('proof-media','proof-media',false,26214400,array['image/jpeg','image/heic','video/mp4']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('profile-media','profile-media',false,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;

create policy proof_upload_own_path on storage.objects for insert to authenticated with check(bucket_id='proof-media' and (storage.foldername(name))[1]=auth.uid()::text);
create policy proof_owner_read on storage.objects for select to authenticated using(bucket_id='proof-media' and ((storage.foldername(name))[1]=auth.uid()::text or exists(select 1 from public.proof_submissions p join public.commitments c on c.id=p.commitment_id where p.asset_path=name and c.circle_id is not null and public.is_circle_member(c.circle_id))));
create policy proof_owner_delete_pending on storage.objects for delete to authenticated using(bucket_id='proof-media' and (storage.foldername(name))[1]=auth.uid()::text and not exists(select 1 from public.proof_submissions p where p.asset_path=name and p.status in ('verified','circle_review','disputed')));
create policy profile_media_own on storage.objects for all to authenticated using(bucket_id='profile-media' and (storage.foldername(name))[1]=auth.uid()::text) with check(bucket_id='profile-media' and (storage.foldername(name))[1]=auth.uid()::text);

-- Hosted projects can use pg_cron + pg_net or an external scheduler. Local cron is intentionally not installed with a secret URL.
commit;
