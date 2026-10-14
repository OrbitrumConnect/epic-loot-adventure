import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { useGameStore } from '@/game/state/game-store';
import { cellCenter } from '@/game/systems/playerBaseSystem';
import type { TowerSource } from '@/game/systems/towerSystem';
import type { BasePiece } from '@/game/types/playerbase';

/** O render apenas agenda; seleção, cooldown e dano pertencem ao sistema/store. */
export function TowerRuntime({ paused }: { paused: boolean }) {
  const cache = useRef<{ pieces: BasePiece[] | null; towers: TowerSource[] }>({ pieces: null, towers: [] });
  useFrame(() => {
    if (paused) return;
    const state = useGameStore.getState();
    const pieces = state.playerBase?.pieces ?? null;
    const current = cache.current;
    if (current.pieces !== pieces) {
      current.pieces = pieces;
      current.towers = [];
      if (pieces) for (const p of pieces) {
        if (p.kind !== 'tower') continue;
        const c = cellCenter(p.cell);
        current.towers.push({ id: p.id, tier: p.tier, level: p.level, hp: p.hp, x: c.x, z: c.z, baseType: state.playerBase?.baseType });
      }
    }
    if (current.towers.length) state.tickTowers(current.towers, Date.now());
  });
  return null;
}
