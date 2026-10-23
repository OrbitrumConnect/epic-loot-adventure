import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { strike } = vi.hoisted(() => ({ strike: vi.fn(() => true) }));
vi.mock('@/components/world/pvp-attack', () => ({ pvpStrike: strike, markPvpHit: vi.fn() }));

import { useGameStore } from '@/game/state/game-store';
import { createInventory, getItemCount } from '@/game/systems/inventorySystem';
import { selectTowerPlayerTarget, type TowerSource } from '@/game/systems/towerSystem';
import { useNet } from '@/net/multiplayer';
import { strikeRemotePiece } from '@/components/world/remote-base-strike';
import { pickAimTarget } from '@/components/world/aim';
import type { BasePiece } from '@/game/types/playerbase';

/* Pedro, 22/10 noite: (1) torre INIMIGA clicável/mirável no PvP, (2) torre da base atira no
   JOGADOR inimigo que vem raidar (bicho tem prioridade; regra PvP aplica no alvo). */
const tower: TowerSource = { id: 't1', tier: 1, level: 1, hp: 100, x: 0, z: 0 };
const initial = useGameStore.getState();
const piece = (id: string, kind: BasePiece['kind'], gx: number, gz: number): BasePiece =>
  ({ id, kind, tier: 1, cell: { gx, gz }, rotation: 0, hp: 50, maxHp: 100 }) as unknown as BasePiece;

afterEach(() => {
  useGameStore.setState(initial, true);
  useNet.setState({ players: {}, bases: {}, selfSide: 'ally' });
  strike.mockClear();
});

describe('torre × jogador inimigo (raid)', () => {
  it('mira o inimigo VIVO mais perto dentro do alcance (17 m no nível 1)', () => {
    const ps = [{ x: 30, z: 0, hp: 50 }, { x: 10, z: 0, hp: 0 }, { x: 12, z: 0, hp: 50 }, { x: 8, z: 3, hp: 50 }];
    expect(selectTowerPlayerTarget(tower, ps, undefined, 1000)).toBe(3);
    expect(selectTowerPlayerTarget(tower, [{ x: 20, z: 0, hp: 50 }], undefined, 1000)).toBe(-1); // fora
  });
  it('respeita a recarga da torre e torre destruída não atira', () => {
    const ps = [{ x: 5, z: 0, hp: 50 }];
    expect(selectTowerPlayerTarget(tower, ps, 900, 1000)).toBe(-1);
    expect(selectTowerPlayerTarget({ ...tower, hp: 0 }, ps, undefined, 1000)).toBe(-1);
  });
  it('tiro da torre gasta 1 bala e marca a recarga; sem bala não atira', () => {
    useGameStore.setState(s => ({ player: { ...s.player, inventory: createInventory([{ itemId: 'ammo', quantity: 3 }]) } }));
    expect(useGameStore.getState().towerFireAtPlayer(tower, { x: 5, z: 0 }, 2, 1000)).toBe(true);
    expect(getItemCount(useGameStore.getState().player.inventory, 'ammo')).toBe(2);
    expect(useGameStore.getState().towerLastShotAt['t1']).toBe(1000);
    useGameStore.setState(s => ({ player: { ...s.player, inventory: createInventory([]) } }));
    expect(useGameStore.getState().towerFireAtPlayer(tower, { x: 5, z: 0 }, 2, 2000)).toBe(false);
  });
});

describe('torre inimiga clicável / na mira', () => {
  const pose = { id: 'p2', name: 'Caio', level: 10, hp: 100, maxHp: 100, x: 0, z: 30, yaw: 0, action: 'idle', t: 0 };

  it('clique na TORRE de inimigo dá o golpe; de aliado só mostra a ficha', () => {
    useNet.setState({ players: { p2: { ...pose, side: 'enemy' } }, bases: { p2: { pieces: [piece('tw', 'tower', 0, 5)] } } as never });
    expect(strikeRemotePiece('p2', 'tw')).toBe(true);
    expect(useGameStore.getState().ui.message).toMatch(/torre de Caio/);
    strike.mockClear();
    useNet.setState({ players: { p2: { ...pose, side: 'ally' } } });
    expect(strikeRemotePiece('p2', 'tw')).toBe(false);
    expect(strike).not.toHaveBeenCalled();
  });

  it('pontinho em cima da torre/muro INIMIGO vira alvo; de aliado não', () => {
    // torre na célula (0,5) → centro ~ (1, 11); câmera olhando pra ela
    useNet.setState({ players: { p2: { ...pose, side: 'enemy' } }, bases: { p2: { pieces: [piece('tw', 'tower', 0, 5)] } } as never });
    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    cam.position.set(1, 2.5, 0); cam.lookAt(1, 2.5, 11); cam.updateMatrixWorld(true);
    expect(pickAimTarget(cam)).toEqual({ kind: 'piece', ownerId: 'p2', pieceId: 'tw' });
    useNet.setState({ players: { p2: { ...pose, side: 'ally' } } });
    expect(pickAimTarget(cam)).toBeNull();
  });
});
