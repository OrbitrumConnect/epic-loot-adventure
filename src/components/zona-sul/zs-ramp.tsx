/**
 * RAMPA DE VOO LIVRE da Pedra Bonita (02/11, Pedro: "área nova — rampa de asa-delta na Pedra Bonita"): a rampa de
 * verdade fica no "Alto do Voo Livre" (OSM, 524 m), na encosta da Pedra Bonita virada pra praia de São Conrado. Aqui:
 * deck de madeira de 14 × 3,4 m, descendo 12° pra fora do morro (a ponta fica no vazio, sobre a descida), parapeito,
 * pés até o chão e uma biruta. Dá pra ANDAR no deck (`zsRampFloor`); saindo pela ponta com a asa-delta na mão ela abre
 * sozinha (a regra de sempre: caindo de lugar alto). Rumo = a descida mais forte em volta do ponto (lado da praia).
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ZS_LANDMARKS } from './zona-sul-meta';
import { type ZsTerrain, zsHeightAt } from './zs-terrain-data';

export const ZS_RAMP_SPOT = 'Alto do Voo Livre';
export const ZS_RAMP = { LEN: 14, WIDTH: 3.4, PITCH_DEG: 12, DECK_T: 0.14, RAIL_H: 0.85 } as const;
export type ZsRamp = { x: number; z: number; y0: number; yaw: number; len: number; width: number; tan: number };

/** Monta a rampa no ponto do OSM: rumo = a descida mais forte (anel de 25 m); começo rente ao chão. Puro. */
export function makeZsRamp(t: ZsTerrain): ZsRamp | null {
  const l = ZS_LANDMARKS.find((m) => m.name === ZS_RAMP_SPOT);
  if (!l) return null;
  let yaw = 0, low = Infinity;
  for (let deg = 0; deg < 360; deg += 5) {
    const a = (deg * Math.PI) / 180, h = zsHeightAt(t, l.x + Math.sin(a) * 25, l.z + Math.cos(a) * 25);
    if (h < low) { low = h; yaw = a; }
  }
  return { x: l.x, z: l.z, y0: zsHeightAt(t, l.x, l.z) + 0.2, yaw, len: ZS_RAMP.LEN, width: ZS_RAMP.WIDTH, tan: Math.tan((ZS_RAMP.PITCH_DEG * Math.PI) / 180) };
}

/** A rampa do mapa (montada quando o terreno carrega). */
export const zsRamp: { cur: ZsRamp | null } = { cur: null };

/** Mundo → rampa: u = ao longo (0 = começo no morro, len = ponta), v = de lado. */
export function rampLocal(r: ZsRamp, x: number, z: number): { u: number; v: number } {
  const dx = x - r.x, dz = z - r.z, s = Math.sin(r.yaw), c = Math.cos(r.yaw);
  return { u: dx * s + dz * c, v: dx * c - dz * s };
}
/** Altura do TOPO do deck em u. */
export const rampDeckY = (r: ZsRamp, u: number) => r.y0 + ZS_RAMP.DECK_T - u * r.tan;

/** Chão do deck em (x, z) pra quem está em cima/encostado (pé até 0,7 m abaixo do deck); senão −∞. */
export function zsRampFloor(x: number, z: number, feetY: number, r: ZsRamp | null = zsRamp.cur): number {
  if (!r) return -Infinity;
  const { u, v } = rampLocal(r, x, z);
  if (u < -0.3 || u > r.len || Math.abs(v) > r.width / 2) return -Infinity;
  const y = rampDeckY(r, Math.max(0, u));
  return feetY >= y - 0.7 ? y : -Infinity;
}

/** Passo EM CIMA do deck: livre ao longo (pode sair pela ponta ou voltar pro morro), o parapeito segura dos lados. */
export function rampStep(x: number, z: number, dx: number, dz: number, r: ZsRamp | null = zsRamp.cur): { x: number; z: number } {
  if (!r) return { x: x + dx, z: z + dz };
  const { u, v } = rampLocal(r, x + dx, z + dz), lim = r.width / 2 - 0.35;
  const vc = Math.max(-lim, Math.min(lim, v)), s = Math.sin(r.yaw), c = Math.cos(r.yaw);
  return { x: r.x + u * s + vc * c, z: r.z + u * c - vc * s };
}

const WOOD = '#8a6440', WOOD_DARK = '#5e4329', SOCK = '#e8742a';
export function ZsRampView({ t }: { t: ZsTerrain }) {
  const r = useMemo(() => makeZsRamp(t), [t]);
  // registra a rampa pro movimento (e tira ao desmontar — só se ainda for a mesma)
  useEffect(() => { zsRamp.cur = r; return () => { if (zsRamp.cur === r) zsRamp.cur = null; }; }, [r]);
  const parts = useMemo(() => {
    if (!r) return null;
    const out: { geo: THREE.BufferGeometry; color: string; pos: [number, number, number]; rot: [number, number, number] }[] = [];
    const tilt = Math.atan(r.tan);
    // deck (uma laje inclinada) — o meio dela em u = len/2
    out.push({ geo: new THREE.BoxGeometry(r.width, ZS_RAMP.DECK_T, r.len / Math.cos(tilt)), color: WOOD, pos: [0, rampDeckY(r, r.len / 2) - ZS_RAMP.DECK_T / 2, r.len / 2], rot: [tilt, 0, 0] });
    // tábuas (faixas mais escuras atravessadas)
    for (let u = 0.6; u < r.len; u += 1.2) out.push({ geo: new THREE.BoxGeometry(r.width + 0.02, 0.02, 0.08), color: WOOD_DARK, pos: [0, rampDeckY(r, u) + 0.005, u], rot: [tilt, 0, 0] });
    // parapeito dos dois lados
    for (const side of [-1, 1]) {
      out.push({ geo: new THREE.BoxGeometry(0.1, 0.1, r.len / Math.cos(tilt)), color: WOOD_DARK, pos: [side * (r.width / 2 - 0.05), rampDeckY(r, r.len / 2) + ZS_RAMP.RAIL_H, r.len / 2], rot: [tilt, 0, 0] });
      for (let u = 0.3; u <= r.len; u += 3.4) out.push({ geo: new THREE.BoxGeometry(0.1, ZS_RAMP.RAIL_H, 0.1), color: WOOD_DARK, pos: [side * (r.width / 2 - 0.05), rampDeckY(r, u) + ZS_RAMP.RAIL_H / 2, u], rot: [0, 0, 0] });
    }
    // pés: do deck até o chão (onde o chão fica abaixo)
    const s = Math.sin(r.yaw), c = Math.cos(r.yaw);
    for (const u of [3, 6.5, 10, r.len - 0.4]) for (const side of [-1, 1]) {
      const v = side * (r.width / 2 - 0.25), wx = r.x + u * s + v * c, wz = r.z + u * c - v * s;
      const top = rampDeckY(r, u) - ZS_RAMP.DECK_T, ground = zsHeightAt(t, wx, wz) - 0.5, h = top - ground;
      if (h > 0.3) out.push({ geo: new THREE.CylinderGeometry(0.11, 0.14, h, 6), color: WOOD_DARK, pos: [v, ground + h / 2, u], rot: [0, 0, 0] });
    }
    // biruta (mastro + saco laranja apontando pro mar)
    const bv = -(r.width / 2 + 1.6), bu = 0.5, bwx = r.x + bu * s + bv * c, bwz = r.z + bu * c - bv * s, bg = zsHeightAt(t, bwx, bwz);
    out.push({ geo: new THREE.CylinderGeometry(0.05, 0.07, 5, 6), color: '#d8d8d8', pos: [bv, bg + 2.5, bu], rot: [0, 0, 0] });
    out.push({ geo: new THREE.ConeGeometry(0.32, 1.6, 8, 1, true), color: SOCK, pos: [bv, bg + 4.75, bu + 0.85], rot: [-Math.PI / 2 + 0.25, 0, 0] });
    // DESEMPENHO: as ~35 peças viram UMA malha por cor (4 desenhos em vez de ~35), mesmo visual
    const byColor = new Map<string, THREE.BufferGeometry[]>(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
    for (const p of out) {
      m.compose(new THREE.Vector3(...p.pos), q.setFromEuler(e.set(...p.rot)), one);
      p.geo.applyMatrix4(m);
      (byColor.get(p.color) ?? byColor.set(p.color, []).get(p.color)!).push(p.geo);
    }
    return [...byColor].map(([color, geos]) => { const geo = mergeGeometries(geos, false); geos.forEach((g) => g.dispose()); return { geo, color }; });
  }, [r, t]);
  useEffect(() => () => { parts?.forEach((p) => p.geo.dispose()); }, [parts]);
  if (!r || !parts) return null;
  return (
    <group position={[r.x, 0, r.z]} rotation={[0, r.yaw, 0]}>
      {parts.map((p) => (
        <mesh key={p.color} geometry={p.geo} castShadow receiveShadow>
          <meshStandardMaterial color={p.color} roughness={0.9} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}
