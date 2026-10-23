import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyPoseTroops, troopPiggyback, type NetTroop } from '@/net/multiplayer';

/* Pedro, 23/10 — online: os outros veem as minhas TROPAS e a EVOLUÇÃO da minha base (pedra/metal).
   Tropas vão de carona na pose (sem mensagem nova — limite de mensagens do Supabase). */
const t = (i: string): NetTroop => ({ i, u: 'warrior', x: 1, z: 2, r: 0, a: 'walk', h: 100, m: 200 });

describe('tropas de carona na pose', () => {
  it('com tropas: vai 1 a cada 3 poses e continua guardado', () => {
    const list = [t('a')];
    expect(troopPiggyback(list, 3)).toEqual({ send: list, next: list });
    expect(troopPiggyback(list, 4)).toEqual({ send: null, next: list });
  });
  it('recolheu (lista vazia): avisa 1× e para; sem nada: não manda', () => {
    expect(troopPiggyback([], 7)).toEqual({ send: [], next: null });
    expect(troopPiggyback(null, 9)).toEqual({ send: null, next: null });
  });
  it('quem recebe: sem `tr` não mexe; vazio apaga; com itens substitui', () => {
    const before = { p2: [t('x')] };
    expect(applyPoseTroops(before, 'p2', undefined)).toBe(before);
    expect(applyPoseTroops(before, 'p2', [])).toEqual({});
    expect(applyPoseTroops({}, 'p3', [t('y')])).toEqual({ p3: [t('y')] });
  });
});

describe('evolução da base pela rede', () => {
  const src = fs.readFileSync('src/components/world/player-base.tsx', 'utf8');
  it('envia o tier (madeira/pedra/metal) junto da base e reenvia quando evolui', () => {
    expect(src).toMatch(/broadcastBase\(base, tier\)/);
    expect(src).toMatch(/tier !== lastTier/);
  });
  it('base remota desenha casa e muros conforme o tier', () => {
    expect(src).toMatch(/<BaseHouse pieces=\{base\.pieces\} remote tier=\{tier\} \/>/);
    expect(src).toMatch(/tier > 0 && <GlbBaseWalls piecesSource=\{piecesSource\} tier=\{tier\} \/>/);
  });
});
