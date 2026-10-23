import { towerLevelStats } from './towerLevelSystem';
import { CREATURES } from '../data/creatures';
import type { CreatureState, Position } from '../types';
import type { BasePiece, BaseType } from '../types/playerbase';
import { baseTowerRange } from './baseTypeSystem';
import { calculateDamage } from './combatSystem';

/** Cache plano: posição calculada só quando as peças mudam. */
export type TowerSource = Position & { id: string; tier: BasePiece['tier']; level?: number | undefined; hp: number; baseType?: BaseType | undefined };

/** Sem mutação/alocação. now e lastShotAt em milissegundos. */
export function selectTowerTarget(tower: TowerSource, creatures: readonly CreatureState[], lastShotAt: number | undefined, now: number): number {
  const combat = towerLevelStats(tower.tier, tower.level);
  if (tower.hp <= 0 || (lastShotAt !== undefined && now - lastShotAt < combat.cooldownMs)) return -1;
  let best = -1;
  const range = baseTowerRange(combat.range, tower.baseType);
  let distance = range * range;
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

/**
 * Online (raid): JOGADOR hostil mais perto no alcance da torre — mesma recarga/alcance do tiro em
 * bicho. `players` já vem filtrado (só inimigos vivos). -1 = ninguém / torre recarregando.
 */
export function selectTowerPlayerTarget(
  tower: TowerSource, players: readonly (Position & { hp: number })[], lastShotAt: number | undefined, now: number,
): number {
  const combat = towerLevelStats(tower.tier, tower.level);
  if (tower.hp <= 0 || (lastShotAt !== undefined && now - lastShotAt < combat.cooldownMs)) return -1;
  const range = baseTowerRange(combat.range, tower.baseType);
  let best = -1;
  let distance = range * range;
  for (let i = 0; i < players.length; i++) {
    const p = players[i]!;
    if (!(p.hp > 0)) continue;
    const d = (p.x - tower.x) ** 2 + (p.z - tower.z) ** 2;
    if (d <= distance) { best = i; distance = d; }
  }
  return best;
}

export function towerDamage(tower: TowerSource, target: CreatureState, rng: () => number): number {
  return calculateDamage(towerLevelStats(tower.tier, tower.level).damage, target.armor, rng);
}
