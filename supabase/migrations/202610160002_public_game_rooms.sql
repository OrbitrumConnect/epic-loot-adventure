-- TRIBOS — public, persistent rooms.
-- Additive: does not change the Editor ADM tables or the existing local save.
-- Browser callers are authenticated anonymously; no service-role key is exposed.

do $$ begin
  create type public.room_member_side as enum ('ally', 'invader');
exception when duplicate_object then null;
end $$;

create table public.game_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{5,8}$'),
  owner_id uuid not null references auth.users(id) on delete restrict,
  max_players smallint not null default 8 check (max_players = 8),
  active_players smallint not null default 0 check (active_players between 0 and 8),
  status text not null default 'open' check (status in ('open', 'paused', 'closed')),
  world_version bigint not null default 1 check (world_version > 0),
  world_snapshot jsonb not null default '{}'::jsonb,
  authority_user_id uuid references auth.users(id) on delete set null,
  authority_lease_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

create table public.game_room_members (
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  side public.room_member_side not null default 'ally',
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (room_id, user_id)
);

create index game_rooms_public_idx on public.game_rooms (status, last_active_at desc);
create index game_room_members_live_idx on public.game_room_members (room_id, last_seen_at desc) where left_at is null;

create or replace function public.set_game_room_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists game_rooms_set_updated_at on public.game_rooms;
create trigger game_rooms_set_updated_at before update on public.game_rooms
  for each row execute procedure public.set_game_room_updated_at();

alter table public.game_rooms enable row level security;
alter table public.game_room_members enable row level security;

create policy "game_rooms_public_read" on public.game_rooms for select to anon, authenticated using (true);
create policy "game_room_members_read_own_room" on public.game_room_members for select to authenticated using (
  exists (select 1 from public.game_room_members mine where mine.room_id = game_room_members.room_id and mine.user_id = auth.uid())
);

create or replace function public.create_public_game_room(p_code text)
returns public.game_rooms
language plpgsql security definer set search_path = public
as $$
declare room public.game_rooms;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  insert into public.game_rooms (code, owner_id, active_players, authority_user_id, authority_lease_until)
  values (upper(trim(p_code)), auth.uid(), 1, auth.uid(), now() + interval '30 seconds')
  returning * into room;
  insert into public.game_room_members (room_id, user_id) values (room.id, auth.uid());
  return room;
end;
$$;

create or replace function public.join_public_game_room(p_code text, p_side public.room_member_side default 'ally')
returns public.game_rooms
language plpgsql security definer set search_path = public
as $$
declare room public.game_rooms; existing public.game_room_members;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select * into room from public.game_rooms where code = upper(trim(p_code)) for update;
  if not found or room.status = 'closed' then raise exception 'room not found'; end if;
  select * into existing from public.game_room_members where room_id = room.id and user_id = auth.uid() for update;
  if found then
    update public.game_room_members set last_seen_at = now(), left_at = null, side = p_side where room_id = room.id and user_id = auth.uid();
  else
    update public.game_room_members set left_at = now() where room_id = room.id and left_at is null and last_seen_at < now() - interval '2 minutes';
    select count(*)::smallint into room.active_players from public.game_room_members where room_id = room.id and left_at is null;
    if room.active_players >= room.max_players then raise exception 'room full'; end if;
    insert into public.game_room_members (room_id, user_id, side) values (room.id, auth.uid(), p_side);
    room.active_players := room.active_players + 1;
  end if;
  update public.game_rooms set active_players = room.active_players, status = 'open', last_active_at = now() where id = room.id returning * into room;
  return room;
end;
$$;

create or replace function public.touch_public_game_room(p_code text)
returns void
language plpgsql security definer set search_path = public
as $$
declare room_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select id into room_id from public.game_rooms where code = upper(trim(p_code));
  if room_id is null then raise exception 'room not found'; end if;
  update public.game_room_members set last_seen_at = now(), left_at = null where room_id = room_id and user_id = auth.uid();
  update public.game_rooms set last_active_at = now() where id = room_id;
end;
$$;

revoke all on public.game_rooms, public.game_room_members from anon, authenticated;
grant select on public.game_rooms to anon, authenticated;
grant execute on function public.create_public_game_room(text) to authenticated;
grant execute on function public.join_public_game_room(text, public.room_member_side) to authenticated;
grant execute on function public.touch_public_game_room(text) to authenticated;
