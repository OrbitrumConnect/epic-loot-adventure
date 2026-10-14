import { cleanup, renderHook } from '@testing-library/react';
import type { RootState } from '@react-three/fiber';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { useGameStore } from '@/game/state/game-store';
import type { CreatureState } from '@/game/types';
import { creatureAnchors, useHostileAI, WOLF_TUNING } from '@/components/world/hostile-ai';

const { frames } = vi.hoisted(() => ({
  frames: [] as Array<(state: RootState, delta: number) => void>,
}));
vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: (state: RootState, delta: number) => void) => frames.push(callback),
}));
vi.mock('@/components/world/world-kit', () => ({
  MAP_HALF: 100, terrainHeight: () => 2, pixelsPerUnit: () => 10, markPointerConsumed: vi.fn(),
}));
vi.mock('@/components/world/base-collision', () => ({
  houseFloorSurfaceY: () => 0,
  pushOutHouseWalls: (x: number, z: number) => [x, z],
  pushOutBasePieces: (x: number, z: number) => [x, z],
  pushOutFactoryWalls: (x: number, z: number) => [x, z],
}));

const initial = useGameStore.getState();
const creature = (id: string): CreatureState => ({
  id, speciesId: 'wolf', name: 'Lobo', hp: 100, maxHp: 100, armor: 2,
  attackPower: 8, attackCooldown: 1.5, lastAttackAt: 0, position: { x: 7, z: 9 },
  behavior: 'patrol', lootTable: [], respawnAt: null,
});

function mountCreature(id: string) {
  const group = new THREE.Group();
  group.position.set(7, 2, 9);
  group.scale.set(2, 3, 4);
  group.rotation.set(0.1, 0.8, -0.2);
  const label = new THREE.Group();
  const hpGroup = new THREE.Group();
  const ring = new THREE.Group();
  const onAnimate = vi.fn();
  renderHook(() => useHostileAI({
    creatureId: id, tuning: WOLF_TUNING, group: { current: group },
    playerRef: { current: null }, label: { current: label },
    hpGroup: { current: hpGroup }, hpFill: { current: null },
    ring: { current: ring }, onAnimate,
  }));
  return { group, label, hpGroup, ring, onAnimate };
}

function frame(elapsedTime: number, delta = 1 / 60) {
  const state = { clock: { elapsedTime } } as RootState;
  for (const callback of frames) callback(state, delta);
}

describe('morte visual compartilhada das criaturas', () => {
  beforeEach(() => {
    frames.length = 0;
    vi.spyOn(Date, 'now').mockReturnValue(1000);
  });
  afterEach(() => {
    cleanup();
    useGameStore.setState(initial, true);
    vi.restoreAllMocks();
  });

  it('anima oito mortes simultâneas, desativa âncoras e indicadores antes de ocultar os corpos', () => {
    const creatures = Array.from({ length: 8 }, (_, i) => creature(`death-${i}`));
    useGameStore.setState({ creatures });
    const models = creatures.map(cr => mountCreature(cr.id));
    frame(0);
    for (const cr of creatures) expect(creatureAnchors.get(cr.id)?.alive).toBe(true);
    const dead = creatures.map(cr => ({ ...cr, hp: 0, behavior: 'dead' as const, respawnAt: 9000 }));
    useGameStore.setState({ creatures: dead });
    frame(0);
    models.forEach(({ group, label, hpGroup, ring }, i) => {
      expect(creatureAnchors.get(creatures[i]!.id)?.alive).toBe(false);
      expect(group.visible).toBe(true);
      expect(label.visible || hpGroup.visible || ring.visible).toBe(false);
    });
    frame(0.2);
    for (const { group } of models) {
      expect(group.visible).toBe(true);
      expect(group.scale.toArray()).toEqual([1, 1.5, 2]);
      expect(group.position.y).toBeCloseTo(1.75);
    }
    frame(0.4);
    for (const { group, onAnimate } of models) {
      expect(group.visible).toBe(false);
      expect(onAnimate).not.toHaveBeenCalled();
    }
    expect(useGameStore.getState().creatures).toBe(dead);
    expect(dead.every(cr => cr.respawnAt === 9000)).toBe(true);
  });

  it('encerra após quadro longo fora da câmera e restaura escala/posição sem alterar rotação no respawn', () => {
    const cr = creature('offscreen');
    useGameStore.setState({ creatures: [cr] });
    const { group } = mountCreature(cr.id);
    const rotation = group.rotation.clone();
    frame(0);
    useGameStore.setState({ creatures: [{ ...cr, hp: 0, behavior: 'dead', respawnAt: 9000 }] });
    frame(0);
    // A animação não depende de câmera, player ou do delta limitado a 0.05.
    group.visible = false;
    frame(5, 5);
    expect(group.visible).toBe(false);
    expect(group.scale.length()).toBe(0);
    expect(creatureAnchors.get(cr.id)?.alive).toBe(false);
    vi.mocked(Date.now).mockReturnValue(9000);
    frame(6, 1);
    expect(group.scale.toArray()).toEqual([2, 3, 4]);
    expect(group.rotation.equals(rotation)).toBe(true);
    expect(group.position.toArray()).toEqual([7, 2, 9]);
    expect(useGameStore.getState().creatures[0]).toMatchObject({ hp: 100, behavior: 'patrol', respawnAt: null });
    frame(6.01);
    expect(group.visible).toBe(true);
    expect(creatureAnchors.get(cr.id)?.alive).toBe(true);
  });
});
