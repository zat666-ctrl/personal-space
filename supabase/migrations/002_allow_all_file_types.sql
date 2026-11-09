-- Keep the private bucket unrestricted by MIME type.
-- Access remains protected by the storage.objects RLS policies from 001_initial.sql.
update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = null
where id = 'personal-files';
