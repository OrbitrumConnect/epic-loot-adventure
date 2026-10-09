/**
 * Base/Claim (Fase 3) — vertical slice: reivindicar um terreno no mundo aberto
 * e erguer uma base própria (solo). Puro e testável; o render e a store usam isto.
 *
 * Direção selada (tribos-tribo-base-comum): solo tem base própria; a base NUNCA
 * nasce dentro de acampamento/ruína/lago/rio. A base comum da tribo (somar pools)
 * é passo seguinte. Aqui é só o claim solo + uma base inicial que cresce por tier.
 */
import type { Position } from '../types';
import { isFreeForWildlife } from './wildlifeSystem';

export type PlayerBase = {
  position: Position;
  tier: number;
  claimedAt: number;
};

/** Tier máximo da base (vertical slice). */
export const MAX_BASE_TIER = 5;

/** Raio do terreno reivindicado — cresce com o tier. */
export function claimRadius(tier: number): number {
  return 5 + (Math.max(1, tier) - 1) * 1.5;
}

/** Custo (madeira/pedra) pra subir PARA um tier. */
export function upgradeCost(toTier: number): { wood: number; stone: number } {
  return { wood: toTier * 12, stone: toTier * 8 };
}

const dist = (a: Position, b: Position) => Math.hypot(a.x - b.x, a.z - b.z);

/** Footprint da base livre (centro + 4 extremos do raio base) — sem pegar água/ruína/acampamento. */
export function baseFootprintFree(center: Position): boolean {
  const r = 5;
  const pts: Position[] = [
    center,
    { x: center.x + r, z: center.z },
    { x: center.x - r, z: center.z },
    { x: center.x, z: center.z + r },
    { x: center.x, z: center.z - r },
  ];
  return pts.every(isFreeForWildlife);
}

/**
 * Procura um ponto válido pra base PERTO do jogador: tenta onde ele está e,
 * se bloqueado, em anéis ao redor. Devolve o 1º livre, ou null se nada serve.
 */
export function findClaimSpot(player: Position): Position | null {
  const rings = [0, 6, 9, 12, 15];
  for (const r of rings) {
    const n = r === 0 ? 1 : 10;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      const p: Position = r === 0
        ? { x: player.x, z: player.z }
        : { x: player.x + Math.sin(ang) * r, z: player.z + Math.cos(ang) * r };
      if (baseFootprintFree(p)) return p;
    }
  }
  return null;
}

/** Jogador está dentro do terreno da base? (pra UI/futuro). */
export function isInsideBase(base: PlayerBase | null, p: Position): boolean {
  if (!base) return false;
  return dist(base.position, p) <= claimRadius(base.tier);
}
