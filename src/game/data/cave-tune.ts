/**
 * Força na CAVERNA por espécie (× vida, × golpe) — 03/11 (Pedro: "cave pode por mais uns 15–20% de inimigos variados";
 * "canibal dentro da cave, espalhado"). O Canibal é CHEFE de onda (2400 de vida, 52 de golpe); na caverna entra o COMUM.
 * Vale DEPOIS da força pela região (`applyWorldLevel` refaz vida/golpe a partir da ficha a cada nascer/renascer — sem isto
 * o redutor sumia: medido 15.084 de vida no salão grande). Só ids `wild_cave_*`; sem entrada = a espécie como é.
 */
export const CAVE_TUNE: Readonly<Record<string, { hp: number; atk: number }>> = { raider_cannibal: { hp: 0.18, atk: 0.5 } };
export const CAVE_ID_PREFIX = 'wild_cave_';
/** O redutor deste bicho (caverna) ou null. */
export function caveTuneFor(id: string, speciesId: string): { hp: number; atk: number } | null {
  return id.startsWith(CAVE_ID_PREFIX) ? CAVE_TUNE[speciesId] ?? null : null;
}
