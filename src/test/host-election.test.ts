import { describe, expect, it } from 'vitest';
import { electHost, roomStatus } from '../net/multiplayer';

describe('sala persiste até 3 dias (multiplayer B)', () => {
  const now = Date.parse('2026-10-21T20:00:00Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();
  it('heartbeat recente = ao vivo', () => expect(roomStatus(ago(30_000), now)).toBe('live'));
  it('sem ninguém há 1 dia = pausada (retomável)', () => expect(roomStatus(ago(24 * 3600_000), now)).toBe('paused'));
  it('sem ninguém há +3 dias = expirada', () => expect(roomStatus(ago(73 * 3600_000), now)).toBe('expired'));
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
