-- BTS TICKET MONITOR — CONFIGURAÇÃO DO SUPABASE
-- Execute todo este arquivo no SQL Editor.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

drop policy if exists "admin lê o próprio cadastro" on public.admin_users;
create policy "admin lê o próprio cadastro"
on public.admin_users
for select
to authenticated
using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'monitor-public',
  'monitor-public',
  true,
  1048576,
  array['application/json']
)
on conflict (id) do update
set public = true,
    file_size_limit = 1048576,
    allowed_mime_types = array['application/json'];

drop policy if exists "admin envia json público" on storage.objects;
create policy "admin envia json público"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'monitor-public'
  and name = 'data.json'
  and exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  )
);

drop policy if exists "admin atualiza json público" on storage.objects;
create policy "admin atualiza json público"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'monitor-public'
  and name = 'data.json'
  and exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  )
)
with check (
  bucket_id = 'monitor-public'
  and name = 'data.json'
  and exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  )
);

-- Depois de criar o usuário em Authentication > Users,
-- substitua o UUID abaixo e execute APENAS este comando:
--
-- insert into public.admin_users (user_id)
-- values ('COLE-AQUI-O-UUID-DO-USUARIO')
-- on conflict do nothing;


-- Bucket público para imagens enviadas pelo painel
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'monitor-media',
  'monitor-media',
  true,
  8388608,
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update
set public = true,
    file_size_limit = 8388608,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'];

drop policy if exists "admin envia imagens" on storage.objects;
create policy "admin envia imagens"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'monitor-media'
  and exists (
    select 1 from public.admin_users where user_id = auth.uid()
  )
);

drop policy if exists "admin atualiza imagens" on storage.objects;
create policy "admin atualiza imagens"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'monitor-media'
  and exists (
    select 1 from public.admin_users where user_id = auth.uid()
  )
)
with check (
  bucket_id = 'monitor-media'
  and exists (
    select 1 from public.admin_users where user_id = auth.uid()
  )
);

drop policy if exists "admin apaga imagens" on storage.objects;
create policy "admin apaga imagens"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'monitor-media'
  and exists (
    select 1 from public.admin_users where user_id = auth.uid()
  )
);
