-- TRIBOS — salas: no máximo 10, somem mais cedo, e o ADMIN fecha (04/11, Pedro: "máximo de 10 salas! eu na conta
-- phpg69@gmail.com sou adm, posso fechar as salas — porque não podem ficar abertas muito tempo, né?!").
-- Aditivo: troca só o corpo do room_heartbeat (mesma assinatura) e cria admin_close_room. Nada de service_role no app.
--
--  * room_heartbeat:
--      - limpeza: sala sem atividade há +12 h é apagada (antes 3 dias); sala FECHADA some 10 min depois (dá tempo de
--        quem estava nela receber o "fechada");
--      - sala FECHADA pelo admin → erro 'room_closed' (o app sai da sala com o aviso);
--      - CRIAR a 11ª sala (abertas/pausadas nas últimas 12 h) → erro 'room_limit' (o app avisa e sai).
--  * admin_close_room(code): só quem é admin (public.is_admin(), tabela user_roles) — marca a sala como 'closed'.
--  * a conta phpg69@gmail.com (a do Pedro) vira admin.

insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where lower(email) = 'phpg69@gmail.com'
on conflict (user_id) do update set role = 'admin', updated_at = now();

create or replace function public.room_heartbeat(
  p_code text, p_players int, p_snapshot jsonb default null, p_release boolean default false
)
returns public.game_rooms
language plpgsql security definer set search_path = public
as $$
declare room public.game_rooms; uid uuid := auth.uid(); c text := upper(trim(p_code)); n int;
begin
  if uid is null then raise exception 'authentication required'; end if;

  delete from public.game_rooms where last_active_at < now() - interval '12 hours';
  delete from public.game_rooms where status = 'closed' and updated_at < now() - interval '10 minutes';

  select * into room from public.game_rooms where code = c for update;
  if found and room.status = 'closed' then raise exception 'room_closed'; end if;
  if not found then
    select count(*) into n from public.game_rooms where status <> 'closed';
    if n >= 10 then raise exception 'room_limit'; end if;
    insert into public.game_rooms (code, owner_id, active_players, status, authority_user_id, authority_lease_until)
    values (c, uid, greatest(0, least(8, p_players)), 'open', uid, now() + interval '60 seconds')
    returning * into room;
  end if;

  if room.authority_user_id is null or room.authority_lease_until is null
     or room.authority_lease_until < now() or room.authority_user_id = uid then
    update public.game_rooms set
      authority_user_id     = case when p_release then null else uid end,
      authority_lease_until = case when p_release then null else now() + interval '60 seconds' end,
      world_snapshot        = coalesce(p_snapshot, world_snapshot),
      world_version         = world_version + case when p_snapshot is null then 0 else 1 end,
      active_players        = greatest(0, least(8, p_players)),
      status                = 'open',
      last_active_at        = now()
    where id = room.id returning * into room;
  else
    update public.game_rooms set last_active_at = now() where id = room.id returning * into room;
  end if;
  return room;
end;
$$;

revoke all on function public.room_heartbeat(text, int, jsonb, boolean) from public, anon;
grant execute on function public.room_heartbeat(text, int, jsonb, boolean) to authenticated;

create or replace function public.admin_close_room(p_code text)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'forbidden'; end if;
  update public.game_rooms set status = 'closed', authority_user_id = null, authority_lease_until = null
  where code = upper(trim(p_code));
  return found;
end;
$$;

revoke all on function public.admin_close_room(text) from public, anon;
grant execute on function public.admin_close_room(text) to authenticated;
grant execute on function public.is_admin() to authenticated;
