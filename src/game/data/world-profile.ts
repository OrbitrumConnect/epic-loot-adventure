/**
 * PERFIL DO MAPA ATIVO (29/10 — a Zona Sul vira o mapa oficial; o Vale sai em breve).
 * Tudo que MUDA de um mapa pro outro mora aqui: limites, chão, onde é terra, nascedouro, zona segura, acampamentos,
 * lagos. As regras (systems/*) e as peças 3D leem daqui — nenhuma delas sabe "qual mapa é".
 *
 * Os objetos de sempre (`PLAYER_SPAWN`, `SAFE_ZONE`, `CAMP_PLACEMENTS`, `LAKE_CENTERS`) continuam sendo a FONTE que
 * todo mundo importa: trocar de mapa troca o CONTEÚDO deles (mesma referência) → quem lê vê o mapa ativo, sem
 * reescrever ~20 arquivos. Voltar ao Vale restaura exatamente os valores originais (cópia feita no carregamento).
 * Quando o Vale sair, a cópia "classic" sai junto e o perfil da Zona Sul vira o padrão.
 */
import type { Position } from '../types';
import { CAMP_PLACEMENTS, LAKE_CENTERS, PLAYER_SPAWN, SAFE_ZONE, WORLD_HALF, type CampPlacement } from './camps';

export type MapId = 'classic' | 'zona-sul';
export type WorldBounds = { minX: number; maxX: number; minZ: number; maxZ: number };

export type WorldProfile = {
  id: MapId;
  bounds: WorldBounds;
  spawn: Position;
  safeZone: { x: number; z: number; radius: number };
  camps: CampPlacement[];
  lakes: { x: number; z: number; r: number }[];
  /** altura do chão em (x, z); null = o relevo do Vale (procedural + GLB) */
  height: ((x: number, z: number) => number) | null;
  /** pode pisar? null = a área andável medida do Vale */
  walkable: ((x: number, z: number) => boolean) | null;
  /** faixas de PERIGO (m do nascedouro) — o mapa maior tem faixas maiores */
  zoneRadii: readonly number[];
};

const CLASSIC: WorldProfile = {
  id: 'classic',
  bounds: { minX: -WORLD_HALF, maxX: WORLD_HALF, minZ: -WORLD_HALF, maxZ: WORLD_HALF },
  spawn: { ...PLAYER_SPAWN },
  safeZone: { ...SAFE_ZONE },
  camps: CAMP_PLACEMENTS.map(c => ({ ...c, position: { ...c.position } })),
  lakes: LAKE_CENTERS.map(l => ({ ...l })),
  height: null,
  walkable: null,
  zoneRadii: [30, 55, 80, 105],
};

/** O mapa ativo (lido por todo mundo; trocado só por `setWorldProfile`). */
export const WORLD: { id: MapId; bounds: WorldBounds; height: WorldProfile['height']; walkable: WorldProfile['walkable']; zoneRadii: readonly number[] } = {
  id: 'classic', bounds: { ...CLASSIC.bounds }, height: null, walkable: null, zoneRadii: CLASSIC.zoneRadii,
};

export function setWorldProfile(p: WorldProfile): void {
  WORLD.id = p.id;
  WORLD.bounds = { ...p.bounds };
  WORLD.height = p.height;
  WORLD.walkable = p.walkable;
  WORLD.zoneRadii = p.zoneRadii;
  Object.assign(PLAYER_SPAWN, p.spawn);
  Object.assign(SAFE_ZONE, p.safeZone);
  CAMP_PLACEMENTS.splice(0, CAMP_PLACEMENTS.length, ...p.camps.map(c => ({ ...c, position: { ...c.position } })));
  LAKE_CENTERS.splice(0, LAKE_CENTERS.length, ...p.lakes.map(l => ({ ...l })));
}

/** Volta ao Vale exatamente como ele nasceu. */
export function resetWorldProfile(): void { setWorldProfile(CLASSIC); }

export function isClassicWorld(): boolean { return WORLD.id === 'classic'; }

/** Prende (x, z) dentro do mapa ativo com `margin` m de folga da borda. */
export function clampX(x: number, margin = 0): number { return Math.max(WORLD.bounds.minX + margin, Math.min(WORLD.bounds.maxX - margin, x)); }
export function clampZ(z: number, margin = 0): number { return Math.max(WORLD.bounds.minZ + margin, Math.min(WORLD.bounds.maxZ - margin, z)); }
