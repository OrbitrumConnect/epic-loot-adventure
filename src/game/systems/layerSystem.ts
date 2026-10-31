/**
 * CAMADAS (30/10 — caverna da Zona Sul). A lógica do jogo é 2D (x, z): sem isto, um bicho na mata EM CIMA da caverna
 * "alcançaria" o herói lá embaixo através de 100 m de rocha (e o chefe da caverna veria quem passa no morro). Cada um tem
 * uma camada — 0 superfície, 1 caverna: o herói escreve a dele todo quadro; a IA escreve a de cada bicho. Ninguém mira,
 * ataca, persegue nem mostra barra pra OUTRA camada. Sem mundo embaixo (Vale): tudo 0 — nada muda.
 */
import { WORLD } from '../data/world-profile';

/** `player` = camada do herói local; `inside` = o herói está DENTRO da caverna (mesmo na boca, que conta como superfície). */
export const layers = { player: 0, inside: false };
const creature = new Map<string, number>();

/** A IA avisa a camada do bicho (só os de baixo ficam guardados). */
export function setCreatureLayer(id: string, layer: number): void {
  if (layer === 0) creature.delete(id); else creature.set(id, layer);
}
export function creatureLayer(id: string): number { return creature.get(id) ?? 0; }
/** O herói enxerga/alcança este bicho? (mesma camada) */
export function sameLayerAsPlayer(id: string): boolean { return !WORLD.under || creatureLayer(id) === layers.player; }
export function resetLayers(): void { layers.player = 0; layers.inside = false; creature.clear(); }
/** Chão dos EFEITOS (número de dano, sangue, tiro) em (x, z): com o herói dentro da caverna, o chão dela. */
export function effectGround(x: number, z: number, surface: number): number {
  const u = WORLD.under;
  if (!u || !layers.inside) return surface;
  return u.floorAt(x, z) ?? surface;
}
