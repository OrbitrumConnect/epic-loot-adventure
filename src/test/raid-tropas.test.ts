import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { strike } = vi.hoisted(() => ({ strike: vi.fn(() => true) }));
vi.mock('@/components/world/pvp-attack', () => ({ pvpStrike: strike, markPvpHit: vi.fn() }));

import { useGameStore } from '@/game/state/game-store';
import { deployTroops, stepTroops, type TroopFoe } from '@/game/systems/troopSystem';
import { useNet, type NetTroop } from '@/net/multiplayer';
import { strikeRemoteTroop } from '@/components/world/remote-base-strike';
import { pickAimTarget } from '@/components/world/aim';

/* Pedro, 23/10 — raid: tropas × jogador inimigo (prioridade), inimigo acerta tropa (o dono aplica),
   torre atira em tropa inimiga. Tudo só com inimizade. */
const C = { x: 0, z: 0 };
const initial = useGameStore.getState();
afterEach(() => {
  useGameStore.setState(initial, true);
  useNet.setState({ players: {}, troops: {}, selfSide: 'ally', connected: false });
  strike.mockClear();
});

describe('tropas preferem o JOGADOR inimigo', () => {
  it('com jogador inimigo na área, ignora o bicho mais perto e vai nele', () => {
    const { field } = deployTroops({ warrior: 1 }, [], C, 1, 0);
    const t = field[0]!;
    const foes: TroopFoe[] = [
      { id: 'bicho', position: { x: t.x + 3, z: t.z }, hp: 50, attackPower: 5, attackCooldown: 1 },
      { id: 'player:p2', position: { x: t.x + 8, z: t.z }, hp: 100, attackPower: 0, attackCooldown: 1, priority: true },
    ];
    const r = stepTroops(field, foes, C, 1, 0.5, 1000);
    expect(r.field[0]!.x).toBeGreaterThan(t.x); // andou rumo ao jogador
    expect(r.hits).toHaveLength(0); // bicho a 3 m não foi atacado
  });
});

describe('inimigo acerta MINHA tropa (chega pela rede)', () => {
  it('dano reduz a vida; zerou → morre no próximo passo e sai da contagem', () => {
    const base = {
      id: 'b', owner: { kind: 'player', id: 'p', name: 'T' }, worldPosition: { x: 0, z: 0 }, origin: { gx: 0, gz: 0 }, size: 11,
      stage: 'clash', enclosed: true, claimedAt: 0, lastDamagedAt: null,
      pieces: [{ id: 'core', kind: 'core', cell: { gx: 5, gz: 5 }, rotation: 0, hp: 500, maxHp: 500, tier: 1 }],
    } as never;
    useGameStore.setState(s => ({ playerBase: base, base: { ...s.base, troops: { archer: 1 } }, creatures: [] }));
    useGameStore.getState().tickTroops(1000, 0.05);
    const id = useGameStore.getState().fieldTroops[0]!.id;
    useGameStore.getState().damageFieldTroop(id, 50);
    expect(useGameStore.getState().fieldTroops[0]!.hp).toBe(140 - 50);
    useGameStore.getState().damageFieldTroop(id, 9999);
    useGameStore.getState().tickTroops(1050, 0.05);
    expect(useGameStore.getState().base.troops['archer']).toBe(0);
    expect(useGameStore.getState().fieldTroops).toHaveLength(0);
  });
});

describe('atacar tropa de outro jogador', () => {
  const tropa: NetTroop = { i: 'troop_1', u: 'warrior', x: 1, z: 11, r: 0, a: 'idle', h: 200, m: 260 };
  const pose = { id: 'p2', name: 'Caio', level: 10, hp: 100, maxHp: 100, x: 0, z: 30, yaw: 0, action: 'idle', t: 0 };

  it('clique: só em tropa de INIMIGO (aliado não)', () => {
    useNet.setState({ players: { p2: { ...pose, side: 'enemy' } }, troops: { p2: [tropa] } });
    expect(strikeRemoteTroop('p2', 'troop_1')).toBe(true);
    useNet.setState({ players: { p2: { ...pose, side: 'ally' } } });
    expect(strikeRemoteTroop('p2', 'troop_1')).toBe(false);
  });

  it('mira: o pontinho em cima da tropa inimiga vira alvo', () => {
    useNet.setState({ players: { p2: { ...pose, side: 'enemy' } }, troops: { p2: [tropa] } });
    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    cam.position.set(1, 1, 0); cam.lookAt(1, 1, 11); cam.updateMatrixWorld(true);
    expect(pickAimTarget(cam)).toEqual({ kind: 'troop', ownerId: 'p2', troopId: 'troop_1' });
  });
});
