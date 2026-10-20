-- TRIBOS — Editor 3D ADM: persistent, authorized world data.
-- Additive migration: it does not alter the local prototype, gameplay, or existing assets.

create extension if not exists pgcrypto;

do $$ begin
  create type public.app_role as enum ('player', 'admin');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'player',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.safe_vec3(value double precision[], max_abs double precision default 1000000)
returns boolean
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select cardinality(value) = 3
    and coalesce((select bool_and(component >= -max_abs and component <= max_abs)
                  from unnest(value) as component), false);
$$;

create table if not exists public.world_assets (
  id uuid primary key default gen_random_uuid(),
  storage_bucket text not null default 'world-assets',
  storage_path text not null unique,
  original_name text not null check (char_length(original_name) between 1 and 240),
  mime_type text not null check (mime_type in ('model/gltf-binary', 'model/gltf+json')),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 104857600),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (storage_bucket = 'world-assets'),
  check (storage_path !~ '(^|/)\\.\\.(/|$)')
);

create table if not exists public.world_objects (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.world_assets(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 120),
  position double precision[] not null default array[0::double precision, 0, 0],
  rotation double precision[] not null default array[0::double precision, 0, 0],
  scale double precision[] not null default array[1::double precision, 1, 1],
  visible boolean not null default true,
  locked boolean not null default false,
  version integer not null default 1 check (version > 0),
  published_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check (public.safe_vec3(position)),
  check (public.safe_vec3(rotation, 6283.185307179586)),
  check (public.safe_vec3(scale, 10000)),
  check (scale[1] > 0 and scale[2] > 0 and scale[3] > 0)
);

create table if not exists public.world_object_versions (
  id uuid primary key default gen_random_uuid(),
  object_id uuid not null references public.world_objects(id) on delete restrict,
  version integer not null check (version > 0),
  operation text not null check (operation in ('create', 'update', 'archive', 'restore')),
  snapshot jsonb not null,
  changed_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (object_id, version)
);

create index if not exists world_objects_active_idx
  on public.world_objects (published_at desc)
  where archived_at is null and visible = true;
create index if not exists world_object_versions_object_idx
  on public.world_object_versions (object_id, version desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute procedure public.set_updated_at();
drop trigger if exists user_roles_set_updated_at on public.user_roles;
create trigger user_roles_set_updated_at before update on public.user_roles
  for each row execute procedure public.set_updated_at();
drop trigger if exists world_assets_set_updated_at on public.world_assets;
create trigger world_assets_set_updated_at before update on public.world_assets
  for each row execute procedure public.set_updated_at();
drop trigger if exists world_objects_set_updated_at on public.world_objects;
create trigger world_objects_set_updated_at before update on public.world_objects
  for each row execute procedure public.set_updated_at();

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', new.email))
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role)
  values (new.id, 'player')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.create_profile_for_new_user();

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.world_assets enable row level security;
alter table public.world_objects enable row level security;
alter table public.world_object_versions enable row level security;

create policy "profiles_select_own_or_admin" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "profiles_update_own_or_admin" on public.profiles
  for update to authenticated using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
create policy "roles_select_own_or_admin" on public.user_roles
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "roles_admin_write" on public.user_roles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "world_assets_admin_only" on public.world_assets
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "world_objects_read_published" on public.world_objects
  for select to anon, authenticated using (archived_at is null and published_at is not null);
create policy "world_objects_admin_read_all" on public.world_objects
  for select to authenticated using (public.is_admin());
create policy "world_objects_admin_write" on public.world_objects
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "world_object_versions_admin_only" on public.world_object_versions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('world-assets', 'world-assets', false, 104857600, array['model/gltf-binary', 'model/gltf+json'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "world_assets_storage_admin_only" on storage.objects
  for all to authenticated
  using (bucket_id = 'world-assets' and public.is_admin())
  with check (bucket_id = 'world-assets' and public.is_admin());

-- Bootstrap is deliberately manual and server-side after the first Auth user exists:
-- update public.user_roles set role = 'admin' where user_id = '<AUTH_USER_UUID>';
