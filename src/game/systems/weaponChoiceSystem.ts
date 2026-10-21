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
/** Entrada no melee exige chegar mais perto que a saída, criando banda morta. */
export const MELEE_SWITCH_IN_FACTOR = 0.8;

/**
 * Preferência de arma do piloto, escolhida pelo jogador no HUD:
 *   - 'auto'   → comportamento por distância de hoje (melee coladinho, ranged longe);
 *   - 'ranged' → prioriza arma à distância com munição, mesmo colado no bicho;
 *   - 'melee'  → prioriza corpo a corpo, mesmo de longe (aproxima pra bater).
 */
export type PilotWeaponStyle = 'auto' | 'melee' | 'ranged';

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
 * Arma pra atacar um alvo a `dist` metros, respeitando a mecânica e o `style`:
 *
 *   'auto' (default, comportamento de hoje):
 *     - ao sair de ranged, só entra no melee em `MELEE_PREF_RANGE * 0.8`;
 *     - já no melee, só volta para ranged depois de `MELEE_PREF_RANGE`;
 *     - sem estado de arma empunhada, `dist <= MELEE_PREF_RANGE` e há melee usável
 *       → melhor melee;
 *     - fora da faixa de melee → entre as ranged usáveis que cobrem `dist`, a
 *       de maior DPS;
 *     - nenhuma ranged cobre a distância (ou falta munição) → melhor melee usável
 *       (o piloto vai se aproximar);
 *     - só há ranged e nenhuma cobre → a de maior alcance (aproxima e atira).
 *
 *   'ranged': se existe QUALQUER ranged usável (com munição), ela ganha mesmo
 *     colado no bicho (ignora MELEE_PREF_RANGE) — a que cobre `dist` com maior
 *     DPS, ou a de maior alcance pra aproximar. Só cai no melee se não houver
 *     nenhuma ranged usável.
 *
 *   'melee': se existe melee usável, ele ganha mesmo de longe (aproxima pra
 *     bater). Só usa ranged se não houver melee usável.
 *
 *   - lista usável vazia → `null`.
 */
export function pickWeaponFor(
  dist: number,
  weapons: AutoWeapon[],
  style: PilotWeaponStyle = 'auto',
  heldIndex?: number,
): AutoWeapon | null {
  const usable = weapons.filter(w => w.hasAmmo);
  if (usable.length === 0) return null;

  const melees = usable.filter(isMelee);
  const ranged = usable.filter(w => !isMelee(w));

  const bestMelee = bestMeleeOf(melees);
  // Arma na MÃO (escolhida pelo jogador), se ainda usável (tem munição).
  const held = heldIndex != null ? usable.find(w => w.hotbarIndex === heldIndex) : undefined;

  if (style === 'ranged') {
    // RESPEITA a arma à distância que o jogador ESCOLHEU (pistola/rifle/arco): usa ela,
    // não auto-troca pela de maior alcance/DPS. Só troca se ela ficar sem munição — aí
    // cai na melhor ranged restante (ex.: acabou a bala → arco). Pedro: "quero pistola/
    // rifle, poder usar os 3".
    if (held && !isMelee(held)) return held;
    const cover = bestRangedCovering(ranged, dist);
    if (cover) return cover;
    const longest = longestRangedOf(ranged);
    if (longest) return longest;
    return bestMelee;
  }

  if (style === 'melee') {
    // Corpo a corpo manda, mesmo de longe (o piloto aproxima). Respeita a melee na mão.
    if (held && isMelee(held)) return held;
    if (bestMelee) return bestMelee;
    const cover = bestRangedCovering(ranged, dist);
    if (cover) return cover;
    return longestRangedOf(ranged);
  }

  // 'auto' (comportamento de hoje).
  // Banda morta: para entrar no melee vindo de ranged, o alvo precisa chegar a
  // 80% da fronteira (2,4 m); já no melee, só sai depois de 3 m. Isso evita que
  // pequenas oscilações em torno da fronteira troquem de arma a cada tick.
  const meleeSwitchInRange = MELEE_PREF_RANGE * MELEE_SWITCH_IN_FACTOR;
  const heldIsMelee = held != null && isMelee(held);
  const meleePreferred = heldIsMelee
    ? dist <= MELEE_PREF_RANGE
    : dist <= (held != null ? meleeSwitchInRange : MELEE_PREF_RANGE);
  if (meleePreferred && bestMelee) return bestMelee;

  // De longe: a ranged que cobre a distância com maior DPS.
  const bestRanged = bestRangedCovering(ranged, dist);
  if (bestRanged) return bestRanged;

  // Nenhuma ranged cobre / sem munição: melee pra aproximar.
  if (bestMelee) return bestMelee;

  // Só há ranged e nenhuma alcança: a de maior alcance, pra aproximar e atirar.
  return longestRangedOf(ranged);
}
