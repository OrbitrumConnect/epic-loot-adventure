-- TRIBOS — Multiplayer B: sala PERSISTE até 3 dias (snapshot do mundo) + heartbeat seguro.
-- Aditivo. Motivo: a tabela game_rooms só tem GRANT de SELECT pro `authenticated`, então o
-- upsert/update direto do app falhava calado (aba Salas nunca listava). Tudo passa por esta
-- função SECURITY DEFINER (sem expor service_role).
--
-- room_heartbeat(code, players, snapshot?, release?):
--  * cria a sala se não existe (dono = quem chamou) e marca last_active_at;
--  * grava world_snapshot SÓ para quem segura a autoridade (lease de 60 s) — ou se a lease
--    venceu/está livre (outro assume) → evita dois clientes gravando por cima;
--  * release=true solta a autoridade na hora (host saiu/passou a vez);
--  * limpeza oportunista: sala sem atividade há +3 dias é apagada.

create or replace function public.room_heartbeat(
  p_code text, p_players int, p_snapshot jsonb default null, p_release boolean default false
)
returns public.game_rooms
language plpgsql security definer set search_path = public
as $$
declare room public.game_rooms; uid uuid := auth.uid(); c text := upper(trim(p_code));
begin
  if uid is null then raise exception 'authentication required'; end if;

  delete from public.game_rooms where last_active_at < now() - interval '3 days';

  select * into room from public.game_rooms where code = c for update;
  if not found then
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
