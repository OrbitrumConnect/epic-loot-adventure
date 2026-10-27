/**
 * Fauna quadrúpede do vale (coelho, cervo, javali, urso, lobo alfa) e um
 * fallback para espécie desconhecida.
 *
 * Mesmo estilo do `Wolf`: caixas baixo-poli, pernas com swing por seno, IA e
 * rótulo vindos de `useHostileAI`. Cada espécie é só uma entrada da tabela
 * `BEASTS` (silhueta, escala, cor e tuning); geometrias e materiais são
 * cacheados por dimensão/cor e compartilhados entre TODOS os animais.
 */
import { useRef, useState } from 'react';
import { EliteAura } from './elite-aura';
import * as THREE from 'three';
import { CREATURES } from '@/game/data/creatures';
import type { Position } from '@/game/types';
import { EnemyLabel, SelectionRing } from './enemy-label';
import { useEnemyClick, useHostileAI, WOLF_TUNING, type HostileTuning } from './hostile-ai';
import { GRAB_SPECIES, grabSpin } from '@/game/systems/grabSystem';
/** Altura do eixo do giro da morte (m, no corpo do jacaré). */
const GRAB_ROLL_H = 0.45;
import { mixColor, terrainHeight, type Palette } from './world-kit';
import { GlbCreature } from './glb-creature';

/** Espécies com modelo GLB (anim própria). Visual troca; IA/colisão/HP ficam.
 *  Os GLB "demo" vêm sem baseColor (brancos) → `tint` dá a cor natural. */
const GLB_CREATURE: Record<string, { url: string; height?: number; yaw?: number; tint?: string; groundBias?: number; fixedScale?: number; autoGround?: boolean }> = {
  // groundBias negativo = desce (os "demo" skinned flutuam ~30cm: bind-pose ≠ anim).
  rabbit: { url: '/models/animals/rabbit.glb', height: 0.42, yaw: 0, tint: '#b7a58a', groundBias: -0.12 },
  // Tamanho REAL (Pedro 25/10: 'sou maior que búfalo e leoa'). `height` mede a malha DEITADA do arquivo: o
  // exibido era ~60–70% dele (medido com a pele). Agora: cervo ~1,75 m c/ galhada, búfalo ~1,65 m × 2,8 m,
  // leoa ~1,05 m × 1,7 m. groundBias escala junto (é medido na escala do modelo).
  // Pedro 25/10 (2ª rodada): cervo +1 m (~2,7 m c/ galhada), búfalo ~2,0 m de altura, ganso/faisão +1 m (~1,4 m).
  deer: { url: '/models/animals/deer.glb', height: 3.54, yaw: 0, tint: '#a8743c', groundBias: -0.63, autoGround: true },
  // Jacaré em tamanho real (Pedro 25/10: 'tá miúdo'): era 0,8 m de comprimento → ~3 m × 0,42 m de altura.
  // groundBias = pé medido na pose salva (1,37 m acima da base da caixa); perto, assenta pelo corpo animado.
  // 25/10 (Pedro: "jacaré menor que búfalo não faz sentido"): 3 → ~4,5 m de comprimento (búfalo 3,4 m).
  // 26/10 (Pedro): jacaré ×1,5 (~6,5 m), búfalo +1 m de altura (×1,5, ~3 m), leão ×1,4 (~1,5 m × 2,4 m). groundBias junto.
  boar: { url: '/models/animals/alligator.glb', height: 5.93, yaw: 0, tint: '#5a6b4a', groundBias: -3.09, autoGround: true },
  bear: { url: '/models/animals/buffalo.glb', height: 5.09, yaw: 0, tint: '#4b3a2a', groundBias: -0.89, autoGround: true },
  wolf_alpha: { url: '/models/animals/lioness.glb', height: 2.59, yaw: 0, tint: '#c49a5e', groundBias: -0.6, autoGround: true },
  // Aves (texturas próprias → sem tint). OBS: a geometria vem com ASAS ABERTAS, então
  // a envergadura (X/Z) é bem maior que a altura (Y) — por isso a altura aqui é BAIXA
  // (normalizamos por Y). 25/10: o exibido (pele aplicada) era ~0,4 m de altura; Pedro pediu +1 m → ~1,4 m.
  goose: { url: '/models/animals/goose.glb', height: 2.17, yaw: 0, groundBias: -0.18, autoGround: true },
  pheasant: { url: '/models/animals/pheasant.glb', height: 2.31, yaw: 0, groundBias: -0.16, autoGround: true },
  // yaw −90° (Pedro 25/10: 'voa de lado'): no arquivo a cabeça aponta pro +X; o jogo anda pra frente em +Z.
  // 26/10 (Pedro): pombo +30% de tamanho (0,002 → 0,0026).
  pigeon: { url: '/models/animals/pigeon.glb', fixedScale: 0.0026, height: 0.39, yaw: -Math.PI / 2, groundBias: 0.6 }, // escala ABSOLUTA (modelo não normaliza); tamanho ~goose
  // Monstros: fixedScale = tamanho_alvo / tamanho_real_MEDIDO (getBounds) — garante
  // o tamanho (a normalização por height falhava nesses modelos de escala maluca).
  eel: { url: '/models/animals/eel.glb', fixedScale: 0.06, yaw: 0, groundBias: 0 }, // real 200×66m + DUPLA-FACE no arquivo (sumia ao virar/single-sided); fixedScale MEDIDO (~4m alto)
  // Aberração: minha versão (albedo + fixedScale MEDIDO) — a do Caio (height 1,3x)
  // ficou ENORME. real 296m -> ~2.5m.
  // Pedro 25/10: "a Aberração dá pra aumentar um pouco" — ~2,5 → ~3,1 m (+25%); assenta pelo corpo animado.
  monster: { url: '/models/animals/monster.glb', fixedScale: 0.0106, yaw: 0, groundBias: 0, autoGround: true },
  collector: { url: '/models/animals/collector.glb', height: 2.2, yaw: 0, groundBias: 0 },        // fora do spawn (quantize)
  civilian: { url: '/models/animals/civilian.glb', fixedScale: 0.01, yaw: 0, groundBias: 0.4, tint: '#8a7a5a' }, // spawn 0 (removido): demo azul + T-pose
  zombie: { url: '/models/animals/zombie.glb', fixedScale: 0.57, yaw: 0, groundBias: 0.4, tint: '#7a8a66' },     // tint esverdeado
  pelter: { url: '/models/animals/pelter.glb', fixedScale: 0.57, yaw: Math.PI, groundBias: -1.1, autoGround: true }, // mech: bind ≠ anim → assenta pelo corpo ANIMADO (Pedro 23/10: não andava no piso); -1.1 = ponto de partida
  flintmaw: { url: '/models/animals/flintmaw.glb', fixedScale: 1.1, yaw: 0, groundBias: 0.3 }, // yaw 0 = vira de frente (vinha de costas ao atacar); voa ~1m (Pedro aprovou)
};

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
    extras: ['antlers', 'belly'], extraColor: '#d8c9a0', labelHeight: 3.3, ringRadius: 1.2,
    tuning: { ...peacefulBase, speed: 3.9, aggroRange: 11, provokeRange: 16 },
  },
  boar: {
    scale: 1, body: [0.55, 0.5, 0.95], bodyColor: '#5a3f2a', legLen: 0.28, legThick: 0.11, legColor: '#3d2a1b',
    head: [0.4, 0.38, 0.44], headColor: '#4a3322', headPos: [0, 0.02, 0.66],
    snout: { size: [0.24, 0.2, 0.2], color: '#8a6a58', pos: [0, -0.04, 0.93] },
    ears: 'cone', earColor: '#3d2a1b', tail: 'stub', tailColor: '#3d2a1b', eyes: '#d84a28',
    extras: ['tusks', 'mane'], extraColor: '#e8e0c8', labelHeight: 1.9, ringRadius: 3.3,
    // 26/10: ×1,5 → alcance da mordida acompanha (do centro do corpo; senão o herói ficava "dentro" do jacaré).
    tuning: { ...hostileBase, speed: 4.1, aggroRange: 7, attackRange: 3.6, leashRange: 16, hitVerb: 'investiu' },
  },
  bear: {
    scale: 1, body: [0.85, 0.75, 1.35], bodyColor: '#4b3424', legLen: 0.45, legThick: 0.2, legColor: '#3a281a',
    head: [0.5, 0.45, 0.5], headColor: '#5a412e', headPos: [0, 0.18, 0.9],
    snout: { size: [0.26, 0.2, 0.24], color: '#8a7058', pos: [0, 0.1, 1.2] },
    ears: 'round', earColor: '#3a281a', tail: 'stub', tailColor: '#3a281a', eyes: '#1a0f08',
    extras: ['hump'], extraColor: '#4b3424', labelHeight: 3.6, ringRadius: 2.5,
    tuning: { ...hostileBase, speed: 3.3, aggroRange: 8, attackRange: 3.6, leashRange: 16, chaseTimeout: 14, walkSpeedChase: 11, walkSpeedIdle: 6, hitVerb: 'rasgou' },
  },
  wolf_alpha: {
    scale: 1, body: [0.55, 0.6, 1.2], bodyColor: '#3a3d44', legLen: 0.4, legThick: 0.14, legColor: '#2a2c32',
    head: [0.46, 0.46, 0.58], headColor: '#575b64', headPos: [0, 0.2, 0.84],
    snout: { size: [0.26, 0.2, 0.28], color: '#7a7e88', pos: [0, 0.12, 1.2] },
    ears: 'cone', earColor: '#2a2c32', tail: 'long', tailColor: '#2a2c32', eyes: '#ff5a1f',
    extras: ['mane'], extraColor: '#8a8f9a', labelHeight: 2.4, ringRadius: 1.4,
    tuning: { ...WOLF_TUNING, speed: 4.4, aggroRange: 11, attackRange: 3.2, leashRange: 28, hitVerb: 'dilacerou' },
  },
  // Pombo Bravo: ave HOSTIL que mergulha no jogador (usa o clip de voo do GLB).
  // Rápida, alcance curto, fraca. Corpo procedural só é usado se o GLB falhar.
  pigeon: {
    scale: 1, body: [0.18, 0.16, 0.26], bodyColor: '#8a8f98', legLen: 0.08, legThick: 0.04, legColor: '#c97a4a',
    head: [0.12, 0.12, 0.14], headColor: '#9aa0aa', headPos: [0, 0.08, 0.16],
    ears: 'cone', earColor: '#8a8f98', tail: 'stub', tailColor: '#8a8f98', eyes: '#d84a28',
    extraColor: '#000000', labelHeight: 3.2, ringRadius: 0.4, // barra acima do voo (a mira usa a altura dela)
    tuning: { ...hostileBase, speed: 5.2, aggroRange: 9, attackRange: 1.8, leashRange: 20, chaseTimeout: 10, walkSpeedChase: 18, walkSpeedIdle: 10, hitVerb: 'bicou' },
  },
};

/** Espécie sem entrada na tabela: quadrúpede cinza genérico, hostil ou pacífico pela definição. */
/** Aves que VOAM (Pedro 25/10, pombo): altura extra acima do pairar do modelo — passeia alto, vem por cima
 *  e MERGULHA no golpe (de cima pra baixo), depois sobe. `cruise` = passeando, `near` = colado no alvo,
 *  `dive` = fundo do mergulho (m acima do pairar). */
export const FLYERS: Record<string, { cruise: number; near: number; dive: number }> = {
  pigeon: { cruise: 2.0, near: 1.3, dive: 0.25 },
};
/** Altura de voo alvo (m acima do pairar): longe → cruzeiro; chegando → desce; golpe → mergulho em arco. */
export function flyLift(f: { cruise: number; near: number; dive: number }, a: { chasing: boolean; distToPlayer: number; swing: number }, t: number): number {
  if (!a.chasing) return f.cruise + Math.sin(t * 1.7) * 0.15;
  const k = Math.min(1, Math.max(0, (a.distToPlayer - 2.5) / 5.5));
  const approach = f.near + (f.cruise - f.near) * k;
  if (a.swing <= 0) return approach;
  const u = 1 - Math.min(1, a.swing / 0.35); // 0 → 1 durante o golpe
  return approach - (approach - f.dive) * Math.sin(u * Math.PI);
}

/** Barra de vida/anel por espécie sem perfil próprio (aves grandes, Aberração maior). */
const BIG_BIRD: Record<string, { labelHeight: number; ringRadius: number }> = {
  monster: { labelHeight: 3.6, ringRadius: 1.4 },
  goose: { labelHeight: 1.9, ringRadius: 0.9 },
  pheasant: { labelHeight: 1.95, ringRadius: 0.9 },
};

/** Ganso e faisão AGRESSIVOS (Pedro 26/10: "atacam rapidinho, correndo"): notam a 7 m, correm rápido (mais que a
 *  leoa), bicam de perto (dano fraco da tabela: 2 / 1) e desistem logo (~5 s ou 12 m de casa). */
export const QUICK_BIRD_TUNING: Record<string, HostileTuning> = {
  goose: { ...hostileBase, speed: 5.4, aggroRange: 7, attackRange: 1.6, leashRange: 12, chaseTimeout: 5, provokeRange: 12, hitVerb: 'bicou' },
  pheasant: { ...hostileBase, speed: 5.8, aggroRange: 7, attackRange: 1.5, leashRange: 12, chaseTimeout: 5, provokeRange: 12, hitVerb: 'bicou' },
};

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
function organicGeo(w: number, h: number, d: number) {
  const key = `o${w},${h},${d}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.SphereGeometry(0.5, 10, 8).scale(w, h, d);
    geoCache.set(key, g);
  }
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
  if (!g) { g = new THREE.SphereGeometry(r, 8, 6); geoCache.set(key, g); }
  return g;
}
function matOf(color: string, emissive = false) {
  const key = `${color}|${emissive ? 1 : 0}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial(
      emissive ? { color, emissive: color, emissiveIntensity: 0.5 } : { color, roughness: 0.94, flatShading: true },
    );
    matCache.set(key, m);
  }
  return m;
}

/** Contorno do corpo procedural (do chão até o topo da cabeça/galhada, da traseira ao focinho) — área de clique
 *  dos bichos com GLB, que antes era o próprio corpo procedural escondido. */
export function beastHitbox(spec: Pick<BeastSpec, 'body' | 'legLen' | 'head' | 'headPos' | 'extras'>) {
  const [bw, bh, bd] = spec.body;
  const [hw, hh, hd] = spec.head;
  const bodyY = spec.legLen + bh / 2;
  const headY = bodyY + spec.headPos[1];
  const top = Math.max(bodyY + bh / 2, headY + hh / 2 + (spec.extras?.includes('antlers') ? 0.46 : 0));
  const front = Math.max(bd / 2, spec.headPos[2] + hd / 2);
  const back = -bd / 2;
  return { w: Math.max(bw * 1.02, hw), h: top, d: front - back, cy: top / 2, cz: (front + back) / 2 };
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
  const baseSpec = BEASTS[speciesId] ?? fallbackSpec(peaceful);
  // Aves grandes (Pedro 25/10: ~1,4 m): barra de vida acima da cabeça (a mira usa a altura dela) e anel maior.
  const bird = BIG_BIRD[speciesId];
  const quick = QUICK_BIRD_TUNING[speciesId];
  const spec = bird ? { ...baseSpec, ...bird, ...(quick ? { tuning: quick } : {}) } : baseSpec;
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
  const movingRef = useRef(false);
  const [elite, setElite] = useState(false); // Enfurecido → fumaça vermelha
  const eliteNow = useRef(false);
  const glb = GLB_CREATURE[speciesId];
  const flyer = FLYERS[speciesId];
  const flyRef = useRef<THREE.Group>(null);
  const onClick = useEnemyClick(creatureId, name);

  useHostileAI({
    creatureId,
    bodyRadius: spec.ringRadius * 0.75, // separação pelo tamanho (búfalo ~1,3 m, coelho ~0,26 m)
    tuning: spec.tuning,
    group: ref,
    playerRef,
    label,
    hpFill,
    hpGroup,
    ring,
    onAnimate: anim => {
      if (anim.elite !== eliteNow.current) { eliteNow.current = anim.elite; setElite(anim.elite); }
      movingRef.current = anim.moving; // dirige a animação do GLB (anda/para)
      if (flyer && flyRef.current) {
        const want = flyLift(flyer, anim, performance.now() / 1000);
        const y = flyRef.current.position.y;
        flyRef.current.position.y = y + (want - y) * (anim.swing > 0 ? 0.35 : 0.08); // mergulho rápido, subida suave
      }
      // GIRO DA MORTE (jacaré, grabSystem): rola em volta do PRÓPRIO corpo (eixo a ~0,45 m), não do pé.
      if (GRAB_SPECIES.has(speciesId) && flyRef.current) {
        const a = grabSpin(creatureId);
        flyRef.current.rotation.z = a;
        flyRef.current.position.x = GRAB_ROLL_H * Math.sin(a);
        flyRef.current.position.y = GRAB_ROLL_H * (1 - Math.cos(a));
      }
      if (glb) return;                 // GLB anima sozinho; pula as pernas procedurais
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
  const coat = matOf(mixColor(spec.bodyColor, c.trunk, 0.2));
  const face = matOf(mixColor(spec.headColor, c.rock, 0.15));
  const hit = beastHitbox(spec);

  return (
    <group ref={ref} position={[start.x, y, start.z]} scale={spec.scale} onPointerDown={onClick}>
      {elite && <EliteAura height={spec.labelHeight * 0.8} />}
      <SelectionRing ring={ring} radius={spec.ringRadius} c={c} />
      <EnemyLabel name={name} height={spec.labelHeight} hpGroup={hpGroup} label={label} hpFill={hpFill} c={c} />
      {glb && <group ref={flyRef}>
        <GlbCreature url={glb.url} movingRef={movingRef} height={glb.height} yaw={glb.yaw ?? Math.PI} tint={glb.tint} groundBias={glb.groundBias ?? 0} fixedScale={glb.fixedScale} autoGround={glb.autoGround ?? false} />
      </group>}
      {/* 27/10: com GLB o corpo procedural (~20 peças) ficava montado e escondido só pra servir de área de clique (o
          three.js clica em objeto invisível) — mas pagava o cálculo de matriz todo quadro. Vira UMA caixa invisível
          com o mesmo contorno (corpo + cabeça), mesma área de clique/toque. */}
      {glb ? (
        <mesh visible={false} position={[0, hit.cy, hit.cz]} geometry={boxGeo(hit.w, hit.h, hit.d)} material={coat} />
      ) : (
      <group ref={inner}>
        {/* Corpo */}
        <mesh position={[0, bodyY, 0]} castShadow geometry={organicGeo(bw, bh, bd)} material={coat} />
        {/* Anatomical shoulder and haunch masses share cached geometry. */}
        <mesh position={[0, bodyY + bh * 0.05, bd * 0.26]} castShadow geometry={organicGeo(bw * 1.02, bh * 1.05, bd * 0.48)} material={coat} />
        <mesh position={[0, bodyY - bh * 0.06, -bd * 0.28]} castShadow geometry={organicGeo(bw * 0.92, bh * 0.95, bd * 0.42)} material={coat} />
        <mesh position={[0, bodyY + spec.headPos[1] * 0.45, headZ * 0.68]} rotation={[-0.42, 0, 0]} castShadow geometry={organicGeo(hw * 0.94, Math.max(hh, spec.headPos[1] + hh * 0.5), hd * 0.9)} material={face} />
        {extras.includes('belly') && (
          <mesh position={[0, bodyY - bh * 0.27, 0]} geometry={organicGeo(bw * 0.82, bh * 0.4, bd * 0.7)} material={matOf(c['rock-light'])} />
        )}
        {extras.includes('hump') && (
          <mesh position={[0, bodyY + bh * 0.34, bd * 0.18]} castShadow geometry={organicGeo(bw * 0.8, bh * 0.6, bd * 0.48)} material={coat} />
        )}
        {extras.includes('mane') && (
          <mesh position={[0, bodyY + bh * 0.34, bd * 0.3]} rotation={[0.15, 0, 0]} geometry={organicGeo(bw * 0.7, bh * 0.7, bd * 0.6)} material={matOf(mixColor(spec.extraColor, c.rock, 0.35))} />
        )}
        {/* Cabeça */}
        <mesh position={[0, headY, headZ]} castShadow geometry={organicGeo(hw, hh, hd)} material={face} />
        {spec.snout && (
          <mesh
            position={[spec.snout.pos[0], bodyY + spec.snout.pos[1], spec.snout.pos[2]]}
            geometry={organicGeo(spec.snout.size[0], spec.snout.size[1], spec.snout.size[2])}
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
            geometry={organicGeo(spec.legThick * 1.3, spec.legLen * 1.08, spec.legThick * 1.5)}
            material={matOf(spec.legColor)}
          >
            <mesh position={[0, -legY * 0.82, spec.legThick * 0.25]} geometry={organicGeo(spec.legThick * 1.4, spec.legThick * 0.7, spec.legThick * 1.9)} material={matOf(c.dark)} castShadow />
          </mesh>
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
      )}
    </group>
  );
}
