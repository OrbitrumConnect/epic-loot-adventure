/**
 * ONDE ficam os postes de luz (Pedro 26/10: "os postes seguem uma linha que saiu — tinha um caminho antes; podem ficar
 * na ponte e em outros cantos, coerente"). Antes: ao longo de `ROAD_POINTS`, a estrada do MAPA ANTIGO (escondida desde a
 * troca do mapa) → postes soltos numa linha que ninguém vê. Agora, presos ao que EXISTE no mapa:
 *  - nas PONTES (as do editor, `BAKED_EDITOR_OBJECTS`): 4 por ponte ao longo do tabuleiro, lados alternados — se a
 *    ponte for movida/girada no código, os postes acompanham;
 *  - na ZONA SEGURA (nascedouro): 4 nos cantos.
 * Puro (sem three/React): devolve só x/z; a altura vem do chão real (a ponte é chão registrado).
 */
import { BAKED_EDITOR_OBJECTS } from '../editor/baked-layout';

/** A ponte é normalizada pra 4 m no maior eixo (`PlacedObject`) e esticada pela escala X do editor; eixo longo = X local. */
const BRIDGE_BASE_LEN = 4;
/** Posição ao longo da ponte (fração da metade do comprimento) e lado (−1/+1) de cada poste. */
const BRIDGE_SLOTS: [number, number][] = [[-0.82, 1], [-0.28, -1], [0.28, 1], [0.82, -1]];
/** Distância do eixo da ponte (m): no tabuleiro, perto da beirada (não no corrimão). */
export const BRIDGE_SIDE = 1.6;

export function bridgeLampSpots(): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (const o of BAKED_EDITOR_OBJECTS) {
    if (!o.assetUrl.includes('scrap-bridge')) continue;
    const [px, , pz] = o.transform.position;
    const ry = o.transform.rotation[1];
    const half = (BRIDGE_BASE_LEN * o.transform.scale[0]) / 2;
    // three.js: giro Y de θ leva o X local para (cos θ, −sen θ) e o Z local para (sen θ, cos θ).
    const ax = Math.cos(ry), az = -Math.sin(ry);
    const sx = Math.sin(ry), sz = Math.cos(ry);
    for (const [t, side] of BRIDGE_SLOTS) {
      out.push({ x: px + ax * half * t + sx * BRIDGE_SIDE * side, z: pz + az * half * t + sz * BRIDGE_SIDE * side });
    }
  }
  return out;
}

/** 4 postes nos cantos da zona segura, 1,5 m pra fora do anel. */
export function safeZoneLampSpots(zone: { x: number; z: number; radius: number }): { x: number; z: number }[] {
  const r = zone.radius + 1.5;
  return [45, 135, 225, 315].map((deg) => {
    const a = (deg * Math.PI) / 180;
    return { x: zone.x + Math.cos(a) * r, z: zone.z + Math.sin(a) * r };
  });
}
