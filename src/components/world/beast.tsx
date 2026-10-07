/**
 * Fauna quadrúpede do vale (coelho, cervo, javali, urso, lobo alfa) e um
 * fallback para espécie desconhecida.
 *
 * Mesmo estilo do `Wolf`: caixas baixo-poli, pernas com swing por seno, IA e
 * rótulo vindos de `useHostileAI`. Cada espécie é só uma entrada da tabela
 * `BEASTS` (silhueta, escala, cor e tuning); geometrias e materiais são
 * cacheados por dimensão/cor e compartilhados entre TODOS os animais.
 */
import { useRef } from 'react';
import * as THREE from 'three';
import { CREATURES } from '@/game/data/creatures';
import type { Position } from '@/game/types';
import { EnemyLabel, SelectionRing } from './enemy-label';
import { useEnemyClick, useHostileAI, WOLF_TUNING, type HostileTuning } from './hostile-ai';
import { terrainHeight, type Palette } from './world-kit';

type V3 = [number, number, number];

type BeastSpec = {
  scale: number;
  body: V3;
  bodyColor: string;
  /** Altura do centro do corpo (= comprimento da perna + metade do corpo). */
  legLen: number;
  legThick: number;
  legColor: string;
  head: V3;
  headColor: string;
  /** Posição da cabeça relativa ao centro do corpo. */
  headPos: V3;
  snout?: { size: V3; color: string; pos: V3 };
  ears: 'cone' | 'long' | 'round';
  earColor: string;
  tail: 'stub' | 'long' | 'puff';
  tailColor: string;
  eyes: string;
  extras?: Array<'antlers' | 'tusks' | 'hump' | 'mane' | 'belly'>;
  extraColor: string;
  /** Coelho salta em vez de andar. */
  hop?: boolean;
  labelHeight: number;
  ringRadius: number;
  tuning: HostileTuning;
};

const hostileBase = {
  wanderSpeed: 1.0, leashRange: 22, chaseTimeout: 12, provokeRange: 0,
  walkSpeedChase: 14, walkSpeedIdle: 8,
} as const;

const peacefulBase = {
  wanderSpeed: 0.9, attackRange: 0, leashRange: 40, chaseTimeout: 0,
  walkSpeedChase: 14, walkSpeedIdle: 7, hitVerb: 'bateu', peaceful: true,
} as const;

export const BEASTS: Record<string, BeastSpec> = {
  rabbit: {
    scale: 1, body: [0.22, 0.2, 0.34], bodyColor: '#b7a58a', legLen: 0.12, legThick: 0.06, legColor: '#a08d72',
    head: [0.17, 0.16, 0.2], headColor: '#c4b499', headPos: [0, 0.1, 0.22],
    ears: 'long', earColor: '#c4b499', tail: 'puff', tailColor: '#f2eee4', eyes: '#201810',
    extraColor: '#000000', hop: true, labelHeight: 0.75, ringRadius: 0.35,
    // Notado a 7 m; foge um pouco abaixo da velocidade de caminhada do jogador
    // (4.5), para o piloto e o jogador conseguirem alcançá-lo.
    tuning: { ...peacefulBase, speed: 4.2, aggroRange: 7, provokeRange: 12 },
  },
  deer: {
    scale: 1, body: [0.36, 0.42, 0.95], bodyColor: '#a8743c', legLen: 0.62, legThick: 0.09, legColor: '#7b5429',
    head: [0.22, 0.24, 0.34], headColor: '#b98349', headPos: [0, 0.55, 0.62],
    snout: { size: [0.12, 0.12, 0.14], color: '#2c2118', pos: [0, 0.5, 0.82] },
    ears: 'cone', earColor: '#8f6030', tail: 'stub', tailColor: '#f0e6d2', eyes: '#14100c',
    extras: ['antlers', 'belly'], extraColor: '#d8c9a0', labelHeight: 1.75, ringRadius: 0.7,
    tuning: { ...peacefulBase, speed: 3.9, aggroRange: 11, provokeRange: 16 },
  },
  boar: {
    scale: 1, body: [0.55, 0.5, 0.95], bodyColor: '#5a3f2a', legLen: 0.28, legThick: 0.11, legColor: '#3d2a1b',
    head: [0.4, 0.38, 0.44], headColor: '#4a3322', headPos: [0, 0.02, 0.66],
    snout: { size: [0.24, 0.2, 0.2], color: '#8a6a58', pos: [0, -0.04, 0.93] },
    ears: 'cone', earColor: '#3d2a1b', tail: 'stub', tailColor: '#3d2a1b', eyes: '#d84a28',
    extras: ['tusks', 'mane'], extraColor: '#e8e0c8', labelHeight: 1.2, ringRadius: 0.7,
    tuning: { ...hostileBase, speed: 4.1, aggroRange: 7, attackRange: 2.4, leashRange: 16, hitVerb: 'investiu' },
  },
  bear: {
    scale: 1, body: [0.85, 0.75, 1.35], bodyColor: '#4b3424', legLen: 0.45, legThick: 0.2, legColor: '#3a281a',
    head: [0.5, 0.45, 0.5], headColor: '#5a412e', headPos: [0, 0.18, 0.9],
    snout: { size: [0.26, 0.2, 0.24], color: '#8a7058', pos: [0, 0.1, 1.2] },
    ears: 'round', earColor: '#3a281a', tail: 'stub', tailColor: '#3a281a', eyes: '#1a0f08',
    extras: ['hump'], extraColor: '#4b3424', labelHeight: 1.9, ringRadius: 1.0,
    tuning: { ...hostileBase, speed: 3.3, aggroRange: 8, attackRange: 3.0, leashRange: 16, chaseTimeout: 14, walkSpeedChase: 11, walkSpeedIdle: 6, hitVerb: 'rasgou' },
  },
  wolf_alpha: {
    scale: 1, body: [0.55, 0.6, 1.2], bodyColor: '#3a3d44', legLen: 0.4, legThick: 0.14, legColor: '#2a2c32',
    head: [0.46, 0.46, 0.58], headColor: '#575b64', headPos: [0, 0.2, 0.84],
    snout: { size: [0.26, 0.2, 0.28], color: '#7a7e88', pos: [0, 0.12, 1.2] },
    ears: 'cone', earColor: '#2a2c32', tail: 'long', tailColor: '#2a2c32', eyes: '#ff5a1f',
    extras: ['mane'], extraColor: '#8a8f9a', labelHeight: 1.9, ringRadius: 0.85,
    tuning: { ...WOLF_TUNING, speed: 4.4, aggroRange: 11, attackRange: 2.8, leashRange: 28, hitVerb: 'dilacerou' },
  },
};

/** Espécie sem entrada na tabela: quadrúpede cinza genérico, hostil ou pacífico pela definição. */
function fallbackSpec(peaceful: boolean): BeastSpec {
  return {
    scale: 1, body: [0.42, 0.42, 0.85], bodyColor: '#6b6458', legLen: 0.3, legThick: 0.1, legColor: '#4e483f',
    head: [0.32, 0.32, 0.4], headColor: '#7d7566', headPos: [0, 0.14, 0.58],
    ears: 'cone', earColor: '#4e483f', tail: 'stub', tailColor: '#4e483f', eyes: '#201810',
    extraColor: '#000000', labelHeight: 1.3, ringRadius: 0.6,
    tuning: peaceful
      ? { ...peacefulBase, speed: 4.0, aggroRange: 9, provokeRange: 14 }
      : { ...WOLF_TUNING },
  };
}

/* ------------------------------------------------------------------ *
 * Caches compartilhados
 * ------------------------------------------------------------------ */
const geoCache = new Map<string, THREE.BufferGeometry>();
const matCache = new Map<string, THREE.MeshStandardMaterial>();
const noRaycast = () => {};

function boxGeo(w: number, h: number, d: number) {
  const key = `b${w},${h},${d}`;
  let g = geoCache.get(key);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); geoCache.set(key, g); }
  return g;
}
function coneGeo(r: number, h: number, seg: number) {
  const key = `c${r},${h},${seg}`;
  let g = geoCache.get(key);
  if (!g) { g = new THREE.ConeGeometry(r, h, seg); geoCache.set(key, g); }
  return g;
}
function ballGeo(r: number) {
  const key = `s${r}`;
  let g = geoCache.get(key);
  if (!g) { g = new THREE.SphereGeometry(r, 5, 4); geoCache.set(key, g); }
  return g;
}
function matOf(color: string, emissive = false) {
  const key = `${color}|${emissive ? 1 : 0}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial(
      emissive ? { color, emissive: color, emissiveIntensity: 0.5 } : { color },
    );
    matCache.set(key, m);
  }
  return m;
}

export function isBeast(speciesId: string) {
  return speciesId in BEASTS;
}

export function Beast({
  c, creatureId, speciesId, name, start, playerRef,
}: {
  c: Palette;
  creatureId: string;
  speciesId: string;
  name: string;
  start: Position;
  playerRef: React.RefObject<THREE.Group | null>;
}) {
  const peaceful = CREATURES[speciesId]?.peaceful === true;
  const spec = BEASTS[speciesId] ?? fallbackSpec(peaceful);
  const ref = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const leg0 = useRef<THREE.Mesh>(null);
  const leg1 = useRef<THREE.Mesh>(null);
  const leg2 = useRef<THREE.Mesh>(null);
  const leg3 = useRef<THREE.Mesh>(null);
  const legRefs = [leg0, leg1, leg2, leg3];
  const hpGroup = useRef<THREE.Group>(null);
  const label = useRef<THREE.Group>(null);
  const hpFill = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Object3D>(null);
  const onClick = useEnemyClick(creatureId, name);

  useHostileAI({
    creatureId,
    tuning: spec.tuning,
    group: ref,
    playerRef,
    label,
    hpFill,
    hpGroup,
    ring,
    onAnimate: anim => {
      const swing = anim.moving ? Math.sin(anim.walkCycle) * 0.5 : 0;
      if (spec.hop) {
        // Salto: o corpo todo quica em vez de balançar as pernas.
        const hop = anim.moving ? Math.abs(Math.sin(anim.walkCycle * 0.7)) * 0.22 : 0;
        if (inner.current) inner.current.position.y = hop;
        return;
      }
      const l0 = leg0.current, l1 = leg1.current, l2 = leg2.current, l3 = leg3.current;
      if (l0) l0.rotation.x = swing;
      if (l1) l1.rotation.x = -swing;
      if (l2) l2.rotation.x = -swing;
      if (l3) l3.rotation.x = swing;
    },
  });

  const y = terrainHeight(start.x, start.z);
  const [bw, bh, bd] = spec.body;
  const bodyY = spec.legLen + bh / 2;
  const hx = bw * 0.28;
  const legZ = bd * 0.34;
  const legY = spec.legLen / 2;
  const [hw, hh, hd] = spec.head;
  const headY = bodyY + spec.headPos[1];
  const headZ = spec.headPos[2];
  const extras = spec.extras ?? [];

  return (
    <group ref={ref} position={[start.x, y, start.z]} scale={spec.scale} onPointerDown={onClick}>
      <SelectionRing ring={ring} radius={spec.ringRadius} c={c} />
      <EnemyLabel name={name} height={spec.labelHeight} hpGroup={hpGroup} label={label} hpFill={hpFill} c={c} />
      <group ref={inner}>
        {/* Corpo */}
        <mesh position={[0, bodyY, 0]} castShadow geometry={boxGeo(bw, bh, bd)} material={matOf(spec.bodyColor)} />
        {extras.includes('belly') && (
          <mesh position={[0, bodyY - bh * 0.32, 0]} geometry={boxGeo(bw * 1.02, bh * 0.36, bd * 0.7)} material={matOf(spec.extraColor)} />
        )}
        {extras.includes('hump') && (
          <mesh position={[0, bodyY + bh * 0.55, bd * 0.18]} castShadow geometry={boxGeo(bw * 0.8, bh * 0.4, bd * 0.4)} material={matOf(spec.extraColor)} />
        )}
        {extras.includes('mane') && (
          <mesh position={[0, bodyY + bh * 0.52, bd * 0.3]} rotation={[0.15, 0, 0]} geometry={boxGeo(0.1, 0.12, bd * 0.55)} material={matOf(spec.extraColor)} />
        )}
        {/* Cabeça */}
        <mesh position={[0, headY, headZ]} castShadow geometry={boxGeo(hw, hh, hd)} material={matOf(spec.headColor)} />
        {spec.snout && (
          <mesh
            position={[spec.snout.pos[0], bodyY + spec.snout.pos[1], spec.snout.pos[2]]}
            geometry={boxGeo(spec.snout.size[0], spec.snout.size[1], spec.snout.size[2])}
            material={matOf(spec.snout.color)}
          />
        )}
        {extras.includes('tusks') && [-1, 1].map(s => (
          <mesh
            key={s}
            position={[s * hw * 0.38, headY - hh * 0.2, headZ + hd * 0.55]}
            rotation={[-0.6, 0, s * 0.2]}
            geometry={coneGeo(0.04, 0.2, 3)}
            material={matOf(spec.extraColor)}
          />
        ))}
        {extras.includes('antlers') && [-1, 1].map(s => (
          <group key={s} position={[s * hw * 0.35, headY + hh * 0.5, headZ - hd * 0.1]}>
            <mesh position={[s * 0.04, 0.16, 0]} rotation={[0, 0, -s * 0.25]} geometry={boxGeo(0.035, 0.34, 0.035)} material={matOf(spec.extraColor)} />
            <mesh position={[s * 0.12, 0.3, 0]} rotation={[0, 0, s * 0.7]} geometry={boxGeo(0.03, 0.2, 0.03)} material={matOf(spec.extraColor)} />
            <mesh position={[s * 0.02, 0.36, 0.06]} rotation={[0.7, 0, 0]} geometry={boxGeo(0.03, 0.2, 0.03)} material={matOf(spec.extraColor)} />
          </group>
        ))}
        {/* Olhos */}
        {[-1, 1].map(s => (
          <mesh
            key={s}
            position={[s * hw * 0.34, headY + hh * 0.18, headZ + hd * 0.44]}
            geometry={ballGeo(Math.max(0.025, hw * 0.1))}
            material={matOf(spec.eyes, spec.eyes === '#ff5a1f' || spec.eyes === '#d84a28')}
          />
        ))}
        {/* Orelhas */}
        {[-1, 1].map(s => {
          const ex = s * hw * 0.34;
          const ey = headY + hh * 0.5;
          if (spec.ears === 'long') {
            return (
              <mesh key={s} position={[ex, ey + 0.14, headZ - hd * 0.2]} rotation={[-0.15, 0, s * 0.12]} geometry={boxGeo(0.05, 0.3, 0.04)} material={matOf(spec.earColor)} />
            );
          }
          if (spec.ears === 'round') {
            return (
              <mesh key={s} position={[ex * 1.15, ey + 0.04, headZ - hd * 0.15]} geometry={ballGeo(hw * 0.2)} material={matOf(spec.earColor)} />
            );
          }
          return (
            <mesh key={s} position={[ex, ey + 0.08, headZ - hd * 0.15]} geometry={coneGeo(Math.max(0.05, hw * 0.2), 0.2, 3)} material={matOf(spec.earColor)} />
          );
        })}
        {/* Pernas (dianteiras e traseiras) */}
        {([
          [-hx, legZ, 0], [hx, legZ, 1], [-hx, -legZ, 2], [hx, -legZ, 3],
        ] as const).map(([lx, lz, i]) => (
          <mesh
            key={i}
            ref={legRefs[i] as React.RefObject<THREE.Mesh>}
            position={[lx, legY, lz]}
            castShadow
            geometry={boxGeo(spec.legThick, spec.legLen, spec.legThick * 1.2)}
            material={matOf(spec.legColor)}
          />
        ))}
        {/* Cauda */}
        {spec.tail === 'long' && (
          <mesh position={[0, bodyY + bh * 0.1, -bd * 0.55]} rotation={[0.9, 0, 0]} geometry={boxGeo(0.12, 0.12, 0.55)} material={matOf(spec.tailColor)} />
        )}
        {spec.tail === 'stub' && (
          <mesh position={[0, bodyY + bh * 0.25, -bd * 0.52]} rotation={[0.5, 0, 0]} geometry={boxGeo(0.08, 0.08, 0.18)} material={matOf(spec.tailColor)} />
        )}
        {spec.tail === 'puff' && (
          <mesh position={[0, bodyY + bh * 0.1, -bd * 0.55]} geometry={ballGeo(0.07)} material={matOf(spec.tailColor)} raycast={noRaycast} />
        )}
      </group>
    </group>
  );
}
