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

export function calculateDamage(attackPower: number, targetArmor: number): number {
  const baseDmg = attackPower * (0.85 + Math.random() * 0.3);
  const reduction = targetArmor * 0.5;
  return Math.max(1, Math.round(baseDmg - reduction));
}

/** Fração do ataque a partir da qual o golpe conta como crítico (faixa 1,10-1,15 do sorteio 0,85-1,15). */
export const CRITICAL_ROLL = 1.1;

/**
 * Golpe crítico: o dano bruto (antes da armadura) caiu na faixa alta do sorteio
 * de `calculateDamage`. Pura: deduz do dano já aplicado, sem outro sorteio.
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
): AttackResult {
  const damage = calculateDamage(attackPower, targetArmor);
  const newHp = Math.max(0, targetHp - damage);
  const died = newHp <= 0;

  return {
    hit: true,
    damage,
    targetHp: newHp,
    targetDied: died,
    message: died
      ? `${targetName} derrotado! -${damage} de dano.`
      : `${targetName}: ${newHp}/${targetMaxHp} HP. -${damage} de dano.`,
  };
}
