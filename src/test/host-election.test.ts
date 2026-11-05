import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { electHost, MAX_ROOMS, roomRefusal, roomStatus } from '../net/multiplayer';

// 04/11 (Pedro: "máximo de 10 salas … não podem ficar abertas muito tempo"): pausada até 12 h (era 3 dias)
describe('sala persiste até 12 h (multiplayer B; 04/11 — era 3 dias)', () => {
  const now = Date.parse('2026-10-21T20:00:00Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();
  it('heartbeat recente = ao vivo', () => expect(roomStatus(ago(30_000), now)).toBe('live'));
  it('sem ninguém há 6 h = pausada (retomável)', () => expect(roomStatus(ago(6 * 3600_000), now)).toBe('paused'));
  it('sem ninguém há +12 h = expirada', () => expect(roomStatus(ago(13 * 3600_000), now)).toBe('expired'));
});

describe('salas: máximo 10 + admin fecha (04/11)', () => {
  it('o aviso do banco vira texto pro jogador (e o app sai da sala)', () => {
    expect(roomRefusal('room_closed')).toBe('Sala fechada pelo administrador.');
    expect(roomRefusal('room_limit')).toBe(`Limite de ${MAX_ROOMS} salas abertas — entre numa da lista.`);
    expect(roomRefusal('outro erro')).toBeNull();
    expect(roomRefusal(null)).toBeNull();
    expect(MAX_ROOMS).toBe(10);
  });
  it('migração: 10 salas, 12 h, sala fechada recusa o heartbeat, admin = is_admin() e a conta do Pedro', () => {
    const sql = fs.readFileSync('supabase/migrations/202611040001_rooms_limit_admin_close.sql', 'utf8');
    expect(sql).toContain("delete from public.game_rooms where last_active_at < now() - interval '12 hours';");
    expect(sql).toContain("if found and room.status = 'closed' then raise exception 'room_closed'; end if;");
    expect(sql).toContain("if n >= 10 then raise exception 'room_limit'; end if;");
    expect(sql).toContain("if auth.uid() is null or not public.is_admin() then raise exception 'forbidden'; end if;");
    expect(sql).toContain("where lower(email) = 'phpg69@gmail.com'");
    expect(sql).toContain('revoke all on function public.admin_close_room(text) from public, anon;');
    const panel = fs.readFileSync('src/components/hud/rooms-panel.tsx', 'utf8');
    expect(panel).toContain('{admin && (');
    expect(panel).toContain('await adminCloseRoom(r.code)');
  });
});

describe('migração de host (multiplayer A): outro segura a sala', () => {
  it('host presente continua host, mesmo havendo jogador mais antigo sem flag', () => {
    expect(electHost([
      { id: 'velho', meta: { joinedAt: 1 } },
      { id: 'host', meta: { joinedAt: 5, host: true } },
    ])).toBe('host');
  });

  it('host saiu → o MAIS ANTIGO que restou assume', () => {
    expect(electHost([
      { id: 'b', meta: { joinedAt: 30 } },
      { id: 'a', meta: { joinedAt: 20 } },
      { id: 'c', meta: { joinedAt: 40 } },
    ])).toBe('a');
  });

  it('sala vazia: quem chega sozinho vira host (mundo não fica congelado)', () => {
    expect(electHost([{ id: 'solo', meta: { joinedAt: 99 } }])).toBe('solo');
  });

  it('corrida com dois marcados host → todos escolhem o mesmo (mais antigo, depois id)', () => {
    const members = [
      { id: 'zz', meta: { joinedAt: 10, host: true } },
      { id: 'aa', meta: { joinedAt: 10, host: true } },
    ];
    expect(electHost(members)).toBe('aa');
    expect(electHost([...members].reverse())).toBe('aa');
  });

  it('host AUSENTE (aba escondida / modo Clash) → o presente mais antigo assume', () => {
    expect(electHost([
      { id: 'host', meta: { joinedAt: 1, host: true, away: true } },
      { id: 'b', meta: { joinedAt: 9 } },
      { id: 'a', meta: { joinedAt: 5 } },
    ])).toBe('a');
  });

  it('host volta (presente) mas já há outro host presente → não toma de volta', () => {
    expect(electHost([
      { id: 'antigo', meta: { joinedAt: 1 } },
      { id: 'novo', meta: { joinedAt: 5, host: true } },
    ])).toBe('novo');
  });

  it('todos ausentes → segue a regra normal sobre todos (solo continua)', () => {
    expect(electHost([
      { id: 'host', meta: { joinedAt: 1, host: true, away: true } },
      { id: 'b', meta: { joinedAt: 2, away: true } },
    ])).toBe('host');
  });

  it('ninguém na sala → null', () => {
    expect(electHost([])).toBeNull();
  });
});
