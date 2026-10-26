/**
 * PERIGO PELA GEOGRAFIA (Pedro 25/10). Regra selada em `tribos-nivel-nao-e-porta` (07/10): "a dificuldade pertence à
 * REGIÃO, não ao jogador; sem level-scaling dos inimigos do overworld". A 1ª versão de hoje escalava pelo nível do
 * jogador (fora da regra) → agora a ZONA do bicho (distância do nascedouro) define o perigo:
 *   zona 1 (< 30 m do nascedouro) = como sempre · 2 (< 55) · 3 (< 80) · 4 (< 105) · 5 (resto, os cantos do mapa).
 * Só bichos HOSTIS do mapa e dos acampamentos; pacíficos (comida/farm), horda (já escala por onda) e chefes: iguais.
 *  - Escala leve pela zona: vida +2%/"nível da zona", dano +1,5% (zona 5 ≈ vida ×3,6, dano ×2,9).
 *  - ENFURECIDO: chance 0% (zona 1) → ~11% (2) → ~20% (3) → ~28% (4) → ~36% (5); de NOITE +10% (teto 40%).
 *    3× vida, 2× dano, +35% velocidade, fumaça vermelha (o mundo AVISA o perigo), loot ×2, XP +50%.
 *  - XP NÃO acompanha a vida extra (sai do bicho-base).
 *  - Dois jogadores no mesmo lugar encontram a MESMA ameaça (online e solo), qualquer que seja o nível deles.
 */
import type { CreatureDefinition, CreatureState, Position } from '../types';
import { scaleEnemyHp } from '../data/creatures';
import { CAMP_PLACEMENTS, PLAYER_SPAWN } from '../data/camps';

/** Raios (m, a partir do nascedouro) que separam as zonas 1→2→3→4→5. */
export const ZONE_RADII = [30, 55, 80, 105] as const;
/** "Nível de perigo" de cada zona (entra nas fórmulas de vida/dano/Enfurecido). */
export const ZONE_LEVEL = [1, 30, 60, 95, 130] as const;
/** De noite: chance extra de Enfurecido (todas as zonas acima da 1). */
export const NIGHT_ELITE_BONUS = 0.1;

export function zoneAt(p: Pick<Position, 'x' | 'z'>): number {
  const d = Math.hypot(p.x - PLAYER_SPAWN.x, p.z - PLAYER_SPAWN.z);
  let z = 1;
  for (const r of ZONE_RADII) if (d >= r) z++;
  return z;
}
export function zoneLevel(p: Pick<Position, 'x' | 'z'>): number {
  return ZONE_LEVEL[zoneAt(p) - 1]!;
}

export const HP_PER_LEVEL = 0.02;
export const ATK_PER_LEVEL = 0.015;
export const ELITE_HP = 3;
export const ELITE_ATK = 2;
export const ELITE_SPEED = 1.35;
export const ELITE_XP = 1.5;
export const ELITE_LOOT = 2;
export const ELITE_MAX_CHANCE = 0.4;

export function hostileScale(level: number): { hp: number; atk: number } {
  const l = Math.max(1, Math.floor(level)) - 1;
  return { hp: 1 + HP_PER_LEVEL * l, atk: 1 + ATK_PER_LEVEL * l };
}

/** Chance de nascer Enfurecido no "nível de perigo" `level` (o da zona); de noite +10% fora da zona 1. */
export function eliteChance(level: number, night = false): number {
  if (level <= 5) return 0;
  return Math.min(ELITE_MAX_CHANCE, 0.35 * Math.pow(level / 125, 0.8) + (night ? NIGHT_ELITE_BONUS : 0));
}

/** Nasce num ACAMPAMENTO (id `<acampamento>_e<n>`). Memorizado: a IA pergunta por quadro. */
const campSpawnCache = new Map<string, boolean>();
export function isCampSpawn(id: string): boolean {
  let v = campSpawnCache.get(id);
  if (v === undefined) {
    v = CAMP_PLACEMENTS.some((p) => id.startsWith(`${p.id}_e`));
    if (campSpawnCache.size > 2000) campSpawnCache.clear();
    campSpawnCache.set(id, v);
  }
  return v;
}

/** Bicho do MAPA ou de ACAMPAMENTO (não horda, não chefe do timer). */
export function isWorldSpawn(id: string): boolean {
  return id.startsWith('wild_') || CAMP_PLACEMENTS.some((p) => id.startsWith(`${p.id}_e`));
}

/** Entra no sistema? Hostil + do mapa/acampamento. */
export function scalesWithWorld(c: Pick<CreatureState, 'id'>, def: Pick<CreatureDefinition, 'peaceful'> | undefined): boolean {
  return !!def && !def.peaceful && isWorldSpawn(c.id);
}

/**
 * Vida dos hostis do MAPA e dos ACAMPAMENTOS +33% (Pedro 26/10, conta nv 30: "matando tudo muito fácil, vida precisa
 * subir uns 30–35%"). Horda fica de fora: a bala das torres foi calibrada na vida dela (23/10). Chefes do timer e
 * pacíficos (comida) também iguais.
 */
export const WORLD_HP_BOOST = 1.33;

/** Vida/dano pro nível do mundo (e Elite). Base = o bicho da tabela (com o ajuste geral de vida). */
export function difficultyStats(def: Pick<CreatureDefinition, 'maxHp' | 'attackPower'>, level: number, elite: boolean): { maxHp: number; attackPower: number } {
  const s = hostileScale(level);
  return {
    maxHp: Math.round(scaleEnemyHp(def.maxHp) * WORLD_HP_BOOST * s.hp * (elite ? ELITE_HP : 1)),
    attackPower: Math.max(1, Math.round(def.attackPower * s.atk * (elite ? ELITE_ATK : 1))),
  };
}

const ELITE_SUFFIX = ' Enfurecido';

/**
 * Aplica o nível do mundo num bicho que está (re)nascendo ou parado de vida cheia. `rollElite` = sorteia de novo
 * (renascimento / 1ª vez); senão mantém o que era. Devolve o mesmo objeto se nada muda.
 */
export function applyWorldLevel(
  c: CreatureState, def: CreatureDefinition, level: number, rng: () => number, rollElite: boolean, night = false,
): CreatureState {
  const elite = rollElite ? rng() < eliteChance(level, night) : !!c.elite;
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

