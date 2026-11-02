import { describe, expect, it } from 'vitest';
import type { AutoSnapshot } from '@/game/types';
import { decideIntent } from '@/game/systems/objectiveSystem';

/* Pedro (22/10): o slider de raio do piloto (idle) limita TUDO — "setar 5 m e ele atacar naquele
   range e ficar ali". Escolhe alvo até max(raio, alcance da arma); nunca anda além do raio. */
function snap(partial: Partial<AutoSnapshot>): AutoSnapshot {
  return {
    playerPosition: { x: 0, z: 0 }, playerHp: 100, playerMaxHp: 100, playerDead: false, healSlot: null,
    creatures: [], camps: [], resources: [],
    objectives: { items: [], mode: 'idle', repeat: false, seq: 0 },
    homePosition: { x: 0, z: 1 }, playerLevel: 30,
    ...partial,
  };
}
const foeAt = (x: number) => ({ id: 'foe', position: { x, z: 0 }, behavior: 'patrol' as const, hp: 100, hostile: true, level: 5 });
const nodeAt = (x: number) => ({ id: 'node', kind: 'wood', position: { x, z: 0 }, depleted: false, quantity: 5 });

describe('raio do piloto (slider) no idle', () => {
  it('raio 5 m + espada: inimigo a 20 m é ignorado (fica ali)', () => {
    const i = decideIntent(snap({ autoHuntRadius: 5, attackRange: 4, creatures: [foeAt(20)] }), 1);
    expect(i.kind).toBe('idle');
  });

  it('raio 5 m + arma de longe (20 m): atira em quem está no alcance, SEM andar', () => {
    const i = decideIntent(snap({ autoHuntRadius: 5, attackRange: 20, creatures: [foeAt(15)] }), 1);
    expect(i.kind).toBe('attack');
  });

  it('raio 5 m: recurso a 12 m não puxa o herói', () => {
    const i = decideIntent(snap({ autoHuntRadius: 5, attackRange: 4, resources: [nodeAt(12)] as never }), 1);
    expect(i.kind).not.toBe('move');
  });

  it('raio padrão: o MESMO recurso a 12 m puxa o herói (prova que o teste acima não é vazio)', () => {
    const i = decideIntent(snap({ autoHuntRadius: 45, attackRange: 4, resources: [nodeAt(12)] as never, gatherCapacity: true }), 1);
    expect(i.kind).toBe('move');
  });

  it('raio padrão (45 m): segue caçando longe como antes', () => {
    const i = decideIntent(snap({ autoHuntRadius: 45, attackRange: 4, creatures: [foeAt(30)] }), 1);
    expect(['move', 'attack']).toContain(i.kind);
  });
});

/* Pedro 01/11: "se eu setar a distância 5 m ele não deve ir longe, correto?!" — o raio passa a valer em volta do PONTO
   ONDE LIGOU o automático (círculo): antes ia "somando de bicho em bicho" e, na Zona Sul, explorava o mapa. */
describe('círculo do automático (raio em volta do ponto de partida)', () => {
  const anchor = { x: 0, z: 0 };
  const foe = (id: string, x: number) => ({ id, position: { x, z: 0 }, behavior: 'patrol' as const, hp: 100, hostile: true, level: 5 });

  it('5 m + espada: com o herói já na borda (4 m), o próximo bicho da fila (a 8 m dele, 12 m do ponto) NÃO puxa — antes ia somando', () => {
    const s = snap({ autoHuntRadius: 5, attackRange: 3.2, autoAnchor: anchor, playerPosition: { x: 4, z: 0 }, creatures: [foe('b', 12)] });
    expect(decideIntent(s, 1).kind).not.toBe('attack');
    const i = decideIntent(s, 1);
    if (i.kind === 'move') expect(Math.hypot(i.to.x - anchor.x, i.to.z - anchor.z)).toBeLessThanOrEqual(5 + 1e-6);
    // o mesmo sem o ponto de partida (antes): ia atrás
    expect(decideIntent(snap({ autoHuntRadius: 5, attackRange: 3.2, playerPosition: { x: 4, z: 0 }, creatures: [foe('b', 8.5)] }), 1).kind).toBe('move');
  });

  it('5 m + espada: bicho a 4 m do herói mas além da borda (7 m do ponto) — vai bater, andando NO MÁXIMO até a borda', () => {
    const i = decideIntent(snap({ autoHuntRadius: 5, attackRange: 3.2, autoAnchor: anchor, playerPosition: { x: 3, z: 0 }, creatures: [foe('a', 7)] }), 1);
    expect(i.kind).toBe('move');
    if (i.kind === 'move') expect(i.to.x).toBeCloseTo(5); // para na borda (o bicho a 2 m dali entra no golpe)
  });

  it('5 m + fuzil (20 m): atira de dentro do círculo, sem sair; quem só daria pra pegar saindo do círculo é ignorado', () => {
    const i = decideIntent(snap({ autoHuntRadius: 5, attackRange: 20, autoAnchor: anchor, playerPosition: { x: 4, z: 0 }, creatures: [foe('a', 23)] }), 1);
    expect(i.kind).toBe('attack'); // 19 m do herói, ainda dentro do círculo: atira daqui
    // herói EMPURRADO pra fora do círculo (12 m do ponto): bicho a 19 m dele mas a 31 m do ponto (além de 5 + 20) →
    // ignora e volta pro círculo; sem o ponto de partida (antes) atirava daqui e ia se afastando
    const out = snap({ autoHuntRadius: 5, attackRange: 20, autoAnchor: anchor, playerPosition: { x: 12, z: 0 }, creatures: [foe('a', 31)] });
    expect(decideIntent(out, 1).kind).not.toBe('attack');
    expect(decideIntent(snap({ autoHuntRadius: 5, attackRange: 20, playerPosition: { x: 12, z: 0 }, creatures: [foe('a', 31)] }), 1).kind).toBe('attack');
  });

  it('5 m na Zona Sul (explorar ligado): acabou tudo no círculo → NÃO sai explorando; volta pro ponto', () => {
    const i = decideIntent(snap({ autoHuntRadius: 5, attackRange: 3.2, autoAnchor: anchor, autoExplore: true, playerPosition: { x: 4.5, z: 0 }, creatures: [foe('longe', 60)], resources: [nodeAt(40)] as never, gatherCapacity: true }), 1);
    expect(i.kind === 'idle' || (i.kind === 'move' && Math.hypot(i.to.x, i.to.z) <= 5)).toBe(true);
  });

  it('revide respeita o círculo: quem atira de 30 m não arrasta o herói pra fora', () => {
    const i = decideIntent(snap({ autoHuntRadius: 5, attackRange: 3.2, autoAnchor: anchor, playerLastDamagedAt: 1, creatures: [foe('atirador', 18)] }), 2);
    expect(i.kind === 'idle' || (i.kind === 'move' && Math.hypot(i.to.x, i.to.z) <= 5)).toBe(true);
  });

  it('slider no MÁXIMO (45) = livre como antes: explora o mapa', () => {
    const i = decideIntent(snap({ autoHuntRadius: 45, attackRange: 3.2, autoAnchor: anchor, autoExplore: true, playerPosition: { x: 4.5, z: 0 }, creatures: [foe('longe', 90)] }), 1);
    expect(i.kind).toBe('move');
    if (i.kind === 'move') expect(i.to.x).toBe(90);
  });

  it('quem está te MORDENDO (perseguindo, colado) sempre leva o revide — autodefesa não muda', () => {
    const chaser = { id: 'mordendo', position: { x: 7, z: 0 }, behavior: 'chase' as const, hp: 100, hostile: true, level: 5 };
    const i = decideIntent(snap({ autoHuntRadius: 5, attackRange: 3.2, autoAnchor: anchor, playerPosition: { x: 4.5, z: 0 }, creatures: [chaser] }), 1);
    expect(i.kind).toBe('attack');
  });
});
