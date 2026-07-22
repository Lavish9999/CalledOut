begin;

drop policy if exists proof_admin_review_read on storage.objects;
create policy proof_admin_review_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'proof-media'
  and public.is_admin()
  and exists (
    select 1
    from public.proof_submissions proof
    where proof.asset_path = name
      and proof.deleted_at is null
      and proof.status in ('circle_review', 'disputed')
  )
);

commit;
