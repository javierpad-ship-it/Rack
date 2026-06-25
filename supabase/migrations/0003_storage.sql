-- ============================================================================
-- Rack — Storage para imágenes de plano de tienda
-- ============================================================================

-- Bucket público para lectura (las imágenes de plano se muestran en la web).
insert into storage.buckets (id, name, public)
values ('layouts', 'layouts', true)
on conflict (id) do nothing;

-- Lectura pública del bucket layouts.
create policy "layouts public read"
  on storage.objects for select
  using (bucket_id = 'layouts');

-- Escritura: admin o visual (cualquier tienda; el path empieza con store_id).
-- Para granularidad por tienda se puede refinar con foldername(name)[1].
create policy "layouts write"
  on storage.objects for insert
  with check (
    bucket_id = 'layouts'
    and current_role_name() in ('admin', 'visual')
  );

create policy "layouts update"
  on storage.objects for update
  using (
    bucket_id = 'layouts'
    and current_role_name() in ('admin', 'visual')
  );

create policy "layouts delete"
  on storage.objects for delete
  using (
    bucket_id = 'layouts'
    and current_role_name() in ('admin', 'visual')
  );
