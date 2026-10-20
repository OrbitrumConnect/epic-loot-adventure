/**
 * Escolha de arma do piloto automático (camada pura). Decide, em função da
 * DISTÂNCIA até o alvo e das armas usáveis na hotbar, qual arma empunhar.
 *
 * Antes, o piloto só "atacava" dentro do alcance da arma na mão (espada = 4 m),
 * então arco/pistola/rifle nunca eram eleitos no modo ocioso. Aqui a munição
 * decide sozinha: pistola/rifle gastam `bullet`; quando a bala acaba, o arco
 * (flecha livre) entra no lugar. Sem React, sem store — testável e determinística.
 *
 * Ver `docs/tribos/tribos-weapon-combat-system.md`.
 */
import type { WeaponType } from '../data/weapons';

/** Até esta distância (m) o piloto prefere corpo a corpo, se houver melee usável. */
export const MELEE_PREF_RANGE = 3.0;

export type AutoWeapon = {
  /** Índice na hotbar (0-based) — o que `useHotbarSlot` recebe. */
  hotbarIndex: number;
  itemId: string;
  type: WeaponType;
  /** Alcance já escalado por nível (via `weaponRangeFor`). */
  range: number;
  cooldown: number;
  attackPower: number;
  /** Melee = sempre `true`; ranged = há munição do tipo certo. */
  hasAmmo: boolean;
};

function isMelee(w: AutoWeapon): boolean {
  return w.type === 'melee';
}

/** DPS aproximado: dano por segundo. Cooldown 0 vira 1 pra não dividir por zero. */
function dps(w: AutoWeapon): number {
  return w.attackPower / (w.cooldown > 0 ? w.cooldown : 1);
}

/** Melhor melee: maior attackPower; desempate menor cooldown, depois menor hotbarIndex. */
function bestMeleeOf(melees: AutoWeapon[]): AutoWeapon | null {
  let best: AutoWeapon | null = null;
  for (const w of melees) {
    if (
      best === null
      || w.attackPower > best.attackPower
      || (w.attackPower === best.attackPower && w.cooldown < best.cooldown)
      || (w.attackPower === best.attackPower && w.cooldown === best.cooldown && w.hotbarIndex < best.hotbarIndex)
    ) {
      best = w;
    }
  }
  return best;
}

/** Entre as ranged com `range >= dist`: maior DPS; desempate maior range, depois menor hotbarIndex. */
function bestRangedCovering(ranged: AutoWeapon[], dist: number): AutoWeapon | null {
  let best: AutoWeapon | null = null;
  for (const w of ranged) {
    if (w.range < dist) continue;
    if (
      best === null
      || dps(w) > dps(best)
      || (dps(w) === dps(best) && w.range > best.range)
      || (dps(w) === dps(best) && w.range === best.range && w.hotbarIndex < best.hotbarIndex)
    ) {
      best = w;
    }
  }
  return best;
}

/** Ranged de MAIOR alcance (pra aproximar quando nenhuma cobre a distância). */
function longestRangedOf(ranged: AutoWeapon[]): AutoWeapon | null {
  let best: AutoWeapon | null = null;
  for (const w of ranged) {
    if (best === null || w.range > best.range || (w.range === best.range && w.hotbarIndex < best.hotbarIndex)) {
      best = w;
    }
  }
  return best;
}

/** Maior alcance entre as armas USÁVEIS (hasAmmo). Nenhuma usável → `fallback`. */
export function maxAttackRange(weapons: AutoWeapon[], fallback: number): number {
  let max = -Infinity;
  for (const w of weapons) {
    if (!w.hasAmmo) continue;
    if (w.range > max) max = w.range;
  }
  return max === -Infinity ? fallback : max;
}

/**
 * Arma pra atacar um alvo a `dist` metros, respeitando a mecânica:
 *   - `dist <= MELEE_PREF_RANGE` e há melee usável → melhor melee;
 *   - `dist > MELEE_PREF_RANGE` → entre as ranged usáveis que cobrem `dist`, a de
 *     maior DPS;
 *   - nenhuma ranged cobre a distância (ou falta munição) → melhor melee usável
 *     (o piloto vai se aproximar);
 *   - só há ranged e nenhuma cobre → a de maior alcance (pra aproximar e atirar);
 *   - lista usável vazia → `null`.
 */
export function pickWeaponFor(dist: number, weapons: AutoWeapon[]): AutoWeapon | null {
  const usable = weapons.filter(w => w.hasAmmo);
  if (usable.length === 0) return null;

  const melees = usable.filter(isMelee);
  const ranged = usable.filter(w => !isMelee(w));

  const bestMelee = bestMeleeOf(melees);

  // Coladinho: melee preferido, se existir.
  if (dist <= MELEE_PREF_RANGE && bestMelee) return bestMelee;

  // De longe: a ranged que cobre a distância com maior DPS.
  const bestRanged = bestRangedCovering(ranged, dist);
  if (bestRanged) return bestRanged;

  // Nenhuma ranged cobre / sem munição: melee pra aproximar.
  if (bestMelee) return bestMelee;

  // Só há ranged e nenhuma alcança: a de maior alcance, pra aproximar e atirar.
  return longestRangedOf(ranged);
}
