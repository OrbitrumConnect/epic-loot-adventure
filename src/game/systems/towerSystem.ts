import { BASE_PIECES } from '../data/base-pieces';
import { CREATURES } from '../data/creatures';
import type { CreatureState, Position } from '../types';
import type { BasePiece } from '../types/playerbase';
import { calculateDamage } from './combatSystem';

/** Cache plano: posição calculada só quando as peças mudam. */
export type TowerSource = Position & { id: string; tier: BasePiece['tier']; hp: number };

/** Sem mutação/alocação. now e lastShotAt em milissegundos. */
export function selectTowerTarget(tower: TowerSource, creatures: readonly CreatureState[], lastShotAt: number | undefined, now: number): number {
  const combat = BASE_PIECES.tower.combat![tower.tier - 1]!;
  if (tower.hp <= 0 || (lastShotAt !== undefined && now - lastShotAt < combat.cooldownMs)) return -1;
  let best = -1;
  let distance = combat.range * combat.range;
  for (let i = 0; i < creatures.length; i++) {
    const c = creatures[i]!;
    if (c.hp <= 0 || c.behavior === 'dead' || c.behavior === 'respawning'
      || (c.respawnAt !== null && c.respawnAt > now) || CREATURES[c.speciesId]?.peaceful !== false) continue;
    const dx = c.position.x - tower.x;
    const dz = c.position.z - tower.z;
    const d = dx * dx + dz * dz;
    if (d < distance || (d === distance && (best < 0 || c.hp < creatures[best]!.hp))) {
      best = i;
      distance = d;
    }
  }
  return best;
}

export function towerDamage(tower: TowerSource, target: CreatureState, rng: () => number): number {
  return calculateDamage(BASE_PIECES.tower.combat![tower.tier - 1]!.damage, target.armor, rng);
}
