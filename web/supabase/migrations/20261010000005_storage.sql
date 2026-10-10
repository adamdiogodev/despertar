-- Private bucket for every file in the system (documents, reports, invoices).
-- Objects are uploaded under "<uploader uid>/..." and can be read only by the
-- uploader or by someone who can see a row that references the object — the
-- table RLS is the single source of truth for file access.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'files', 'files', false, 20 * 1024 * 1024,
  array[
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/xml', 'text/xml'
  ]
)
on conflict (id) do nothing;

create policy files_upload_own_folder on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);

create policy files_read_if_referenced on storage.objects for select to authenticated
  using (
    bucket_id = 'files' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from public.documents d where d.file_path = name)
      or exists (select 1 from public.reports r where r.file_path = name)
      or exists (select 1 from public.invoice_requests i where i.invoice_file_path = name)
    )
  );

create policy files_delete_own_folder on storage.objects for delete to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
