import type { AttackResult, Position } from '../types';

export function getDistance(a: Position, b: Position): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export function canAttack(
  attackerLastAttack: number,
  attackerCooldown: number,
  now: number,
  attackerPos: Position,
  targetPos: Position,
  range: number
): boolean {
  if (now - attackerLastAttack < attackerCooldown) return false;
  return getDistance(attackerPos, targetPos) <= range;
}

export function calculateDamage(
  attackPower: number,
  targetArmor: number,
  rng: () => number = Math.random,
  critMultiplier = 1,
): number {
  const baseDmg = attackPower * (0.85 + rng() * 0.3) * critMultiplier;
  const reduction = targetArmor * 0.5;
  return Math.max(1, Math.round(baseDmg - reduction));
}

/** Crítico por destreza: chance (0–1) e multiplicador de dano (≥ 1). */
export type CritStats = { chance: number; multiplier: number };

/** Fração do ataque a partir da qual o golpe conta como crítico (faixa 1,10-1,15 do sorteio 0,85-1,15). */
export const CRITICAL_ROLL = 1.1;

/**
 * LEGADO: heurística de "faixa alta do sorteio". O crítico de verdade agora é o
 * `critical` devolvido por `resolveAttack` (destreza); a store usa ele no visual.
 * Mantido só para compatibilidade/testes. Pura: deduz do dano já aplicado.
 */
export function isCriticalDamage(attackPower: number, targetArmor: number, damage: number): boolean {
  if (attackPower <= 0) return false;
  return (damage + targetArmor * 0.5) / attackPower >= CRITICAL_ROLL;
}

export function resolveAttack(
  attackPower: number,
  targetHp: number,
  targetMaxHp: number,
  targetArmor: number,
  targetName: string,
  crit?: CritStats,
  rng: () => number = Math.random,
): AttackResult {
  // Sem `crit` (ou chance 0) não consome sorteio extra: comportamento idêntico ao de antes.
  const variance = rng();
  const critical = !!crit && crit.chance > 0 && rng() < crit.chance;
  const damage = calculateDamage(attackPower, targetArmor, () => variance, critical ? crit!.multiplier : 1);
  const newHp = Math.max(0, targetHp - damage);
  const died = newHp <= 0;

  return {
    hit: true,
    damage,
    targetHp: newHp,
    targetDied: died,
    critical,
    message: died
      ? `${targetName} derrotado! -${damage} de dano.${critical ? ' Crítico!' : ''}`
      : `${targetName}: ${newHp}/${targetMaxHp} HP. -${damage} de dano.${critical ? ' Crítico!' : ''}`,
  };
}
