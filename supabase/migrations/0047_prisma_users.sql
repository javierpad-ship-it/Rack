-- ============================================================================
-- 0047 — Prisma: DNI, membresía multi-tienda y responsables de línea
--
-- Los usuarios de Prisma se crean en Rack One (mantenimiento especial): el
-- **usuario es el DNI** y la clave inicial también. `profiles.store_id` ya existe
-- como "tienda de casa", pero Prisma necesita que un usuario pueda operar en
-- **varias tiendas** (mono o multi). Además, la aprobación de precios se rutea al
-- **responsable de línea** (campo `resp` del producto), así que hace falta saber
-- qué líneas (`resp`) tiene asignadas cada usuario.
-- ============================================================================

-- DNI del usuario (login = DNI). Único cuando está presente.
alter table profiles add column if not exists dni text;
create unique index if not exists profiles_dni_key on profiles(dni) where dni is not null;

-- Membresía usuario ↔ tiendas (mono = 1 fila, multi = N).
create table if not exists user_stores (
  user_id  uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references stores(id)      on delete cascade,
  primary key (user_id, store_id)
);
create index if not exists user_stores_store_idx on user_stores(store_id);

-- Líneas (resp) que cada usuario tiene como responsable (para la bandeja).
create table if not exists user_lines (
  user_id uuid not null references auth.users(id) on delete cascade,
  resp    text not null,
  primary key (user_id, resp)
);

alter table user_stores enable row level security;
alter table user_lines  enable row level security;

drop policy if exists user_stores_read on user_stores;
create policy user_stores_read on user_stores for select
  using (user_id = auth.uid() or current_role_name() in ('admin','analista'));

drop policy if exists user_lines_read on user_lines;
create policy user_lines_read on user_lines for select
  using (user_id = auth.uid() or current_role_name() in ('admin','analista'));

-- ¿Puede el usuario actual operar en esta tienda? admin/analista → todas;
-- el resto → sus tiendas de `user_stores` (o su `profiles.store_id` de casa).
create or replace function can_use_store(p_store uuid)
returns boolean language sql stable security definer as $$
  select
    current_role_name() in ('admin','analista')
    or exists (select 1 from user_stores  where user_id = auth.uid() and store_id = p_store)
    or exists (select 1 from profiles      where id = auth.uid()      and store_id = p_store);
$$;

-- Tiendas que el usuario actual puede elegir en Prisma (para el selector).
create or replace function my_stores()
returns table(id uuid, code text, name text, sales_org text)
language sql stable security definer as $$
  select s.id, s.code, s.name, s.sales_org
  from stores s
  where current_role_name() in ('admin','analista')
     or exists (select 1 from user_stores us where us.user_id = auth.uid() and us.store_id = s.id)
     or exists (select 1 from profiles p where p.id = auth.uid() and p.store_id = s.id)
  order by s.name;
$$;
