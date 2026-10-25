/**
 * DIFICULDADE PELO NÍVEL DO MUNDO (Pedro 25/10, nv 125: "andando no mapa ainda acho fácil" — medido: a partir do
 * ~nv 40 todo bicho do mapa morria com 1 golpe e não ameaçava). Só bichos HOSTIS do mapa e dos acampamentos;
 * pacíficos (comida/farm), horda (já escala por onda) e chefes ficam como estão.
 *
 *  - Escala leve: vida +2%/nível, dano +1,5%/nível (metade do crescimento do herói → ele segue se sentindo forte).
 *  - ENFURECIDO (Elite): chance ~0% (nv ≤5) → ~11% (30) → ~20% (60) → 35% (125), teto 40%. 3× vida, 2× dano,
 *    +35% velocidade, fumaça vermelha, loot ×2, XP +50%.
 *  - XP NÃO acompanha a vida extra (sai do bicho-base): subir já é rápido (75 níveis em 37 h, medido 24/10).
 *  - Nível do mundo = o MAIOR nível na sala (online: quem anda com veterano enfrenta bicho forte e ganha o loot).
 */
import type { CreatureDefinition, CreatureState } from '../types';
import { scaleEnemyHp } from '../data/creatures';
import { CAMP_PLACEMENTS } from '../data/camps';

export const HP_PER_LEVEL = 0.02;
export const ATK_PER_LEVEL = 0.015;
export const ELITE_HP = 3;
export const ELITE_ATK = 2;
export const ELITE_SPEED = 1.35;
export const ELITE_XP = 1.5;
export const ELITE_LOOT = 2;
export const ELITE_MAX_CHANCE = 0.4;
/** Só reescala bicho parado e de vida cheia quando o nível do mundo mudar pelo menos isso. */
export const RESCALE_STEP = 5;

export function hostileScale(level: number): { hp: number; atk: number } {
  const l = Math.max(1, Math.floor(level)) - 1;
  return { hp: 1 + HP_PER_LEVEL * l, atk: 1 + ATK_PER_LEVEL * l };
}

/** Chance de nascer Enfurecido no nível do mundo `level`. */
export function eliteChance(level: number): number {
  if (level <= 5) return 0;
  return Math.min(ELITE_MAX_CHANCE, 0.35 * Math.pow(level / 125, 0.8));
}

/** Bicho do MAPA ou de ACAMPAMENTO (não horda, não chefe do timer). */
export function isWorldSpawn(id: string): boolean {
  return id.startsWith('wild_') || CAMP_PLACEMENTS.some((p) => id.startsWith(`${p.id}_e`));
}

/** Entra no sistema? Hostil + do mapa/acampamento. */
export function scalesWithWorld(c: Pick<CreatureState, 'id'>, def: Pick<CreatureDefinition, 'peaceful'> | undefined): boolean {
  return !!def && !def.peaceful && isWorldSpawn(c.id);
}

/** Vida/dano pro nível do mundo (e Elite). Base = o bicho da tabela (com o ajuste geral de vida). */
export function difficultyStats(def: Pick<CreatureDefinition, 'maxHp' | 'attackPower'>, level: number, elite: boolean): { maxHp: number; attackPower: number } {
  const s = hostileScale(level);
  return {
    maxHp: Math.round(scaleEnemyHp(def.maxHp) * s.hp * (elite ? ELITE_HP : 1)),
    attackPower: Math.max(1, Math.round(def.attackPower * s.atk * (elite ? ELITE_ATK : 1))),
  };
}

const ELITE_SUFFIX = ' Enfurecido';

/**
 * Aplica o nível do mundo num bicho que está (re)nascendo ou parado de vida cheia. `rollElite` = sorteia de novo
 * (renascimento / 1ª vez); senão mantém o que era. Devolve o mesmo objeto se nada muda.
 */
export function applyWorldLevel(
  c: CreatureState, def: CreatureDefinition, level: number, rng: () => number, rollElite: boolean,
): CreatureState {
  const elite = rollElite ? rng() < eliteChance(level) : !!c.elite;
  const st = difficultyStats(def, level, elite);
  const name = elite ? `${def.name}${ELITE_SUFFIX}` : def.name;
  if (c.maxHp === st.maxHp && c.attackPower === st.attackPower && !!c.elite === elite && c.name === name && c.scaledLevel === level) return c;
  return { ...c, maxHp: st.maxHp, hp: st.maxHp, attackPower: st.attackPower, elite, name, scaledLevel: level };
}

/** Enfurecido dá o dobro de loot (quantidades). */
export function eliteLoot<T extends { quantity: number }>(loot: T[], c: Pick<CreatureState, 'elite'>): T[] {
  return c.elite ? loot.map((d) => ({ ...d, quantity: d.quantity * ELITE_LOOT })) : loot;
}

/** XP do abate: Enfurecido +50% (o resto é o XP do bicho-base). */
export function eliteXp(xp: number, c: Pick<CreatureState, 'elite'>): number {
  return c.elite ? Math.round(xp * ELITE_XP) : xp;
}

/** Nível do mundo: o maior entre o meu e o dos outros jogadores da sala. */
export function worldLevel(myLevel: number, others: number[]): number {
  return Math.max(myLevel, ...others.filter((n) => Number.isFinite(n)));
}
