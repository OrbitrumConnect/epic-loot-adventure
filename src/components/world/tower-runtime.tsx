import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { useGameStore } from '@/game/state/game-store';
import { cellCenter } from '@/game/systems/playerBaseSystem';
import { selectTowerPlayerTarget, type TowerSource } from '@/game/systems/towerSystem';
import { towerLevelStats } from '@/game/systems/towerLevelSystem';
import { broadcastPlayerHit, MP_ENABLED, useNet } from '@/net/multiplayer';
import type { BasePiece } from '@/game/types/playerbase';

/** O render apenas agenda; seleção, cooldown e dano pertencem ao sistema/store. */
export function TowerRuntime({ paused }: { paused: boolean }) {
  const cache = useRef<{ pieces: BasePiece[] | null; towers: TowerSource[] }>({ pieces: null, towers: [] });
  const accum = useRef(0);
  useFrame((_, delta) => {
    if (paused) {
      accum.current = 0;
      return;
    }
    accum.current += Math.min(delta, 0.1);
    if (accum.current < 0.05) return;
    accum.current %= 0.05;

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
    const now = Date.now();
    // Tropas nas ondas (etapa 1): mesmo relógio das torres (20×/s).
    state.tickTroops(now, 0.05);
    if (!current.towers.length) return;
    state.tickTowers(current.towers, now);
    if (MP_ENABLED) towersHitEnemyPlayers(current.towers, now);
  });
  return null;
}

/**
 * RAID (online): torre que NÃO atirou em bicho e está pronta mira o jogador HOSTIL mais perto no
 * alcance — bicho tem prioridade (defesa da horda igual). Gasta a mesma bala; o dano vai pela rede
 * e o ALVO aplica a regra PvP de sempre (fração + armadura + teto por golpe). Tropas do raid vão
 * tankar isso (visão do Pedro). Torre nunca alcança outra base (66 m entre inimigos × 30 m).
 */
function towersHitEnemyPlayers(towers: readonly TowerSource[], now: number): void {
  const net = useNet.getState();
  if (!net.connected) return;
  const hostile = Object.values(net.players).filter((r) => r.hp > 0 && (r.side === 'enemy' || net.selfSide === 'enemy'));
  if (hostile.length === 0) return;
  for (const tower of towers) {
    const st = useGameStore.getState();
    const i = selectTowerPlayerTarget(tower, hostile, st.towerLastShotAt[tower.id], now);
    if (i < 0) continue;
    const r = hostile[i]!;
    const chestY = Number.isFinite(r.y) ? (r.y as number) + 1.0 : undefined;
    if (!st.towerFireAtPlayer(tower, { x: r.x, z: r.z }, chestY, now)) return; // sem bala: nenhuma atira
    broadcastPlayerHit(r.id, towerLevelStats(tower.tier, tower.level).damage, `Torre de ${net.selfName}`);
  }
}
