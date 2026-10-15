/**
 * Saqueadores (`raider_*`) — humanoides hostis construídos no mesmo estilo do
 * jogador: pernas, corpo, cabeça em caixas baixas-poli e andar por swing de
 * seno. Pele escura, pintura de guerra e arma tosca para ler como inimigo.
 *
 * Geometrias e materiais são compartilhados entre TODOS os saqueadores
 * (um acampamento tem até ~10 e o mapa 4+ acampamentos).
 */
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Position } from '@/game/types';
import { EnemyLabel, SelectionRing } from './enemy-label';
import { useEnemyClick, useHostileAI, type HostileTuning } from './hostile-ai';
import { GlbHero, type HeroAction } from './glb-hero';
import { GlbStaticBoss } from './glb-static-boss';
import { GlbCreature } from './glb-creature';

/** Bosses de MONSTRO com rig PRÓPRIO + anim embutida (não-UAL) → renderer de
 *  criatura (toca o clip do modelo). Modelos skinned e leves (<15MB). */
const CREATURE_BOSS: Record<string, { url: string; height: number; yaw?: number; tint?: string; groundBias?: number }> = {
  // Mushroom = Pigman (tem idle/walk/run PRÓPRIOS → anda de verdade). 21MB→3.3MB.
  raider_mushroom: { url: '/models/bosses/pigman.glb', height: 4.5, yaw: Math.PI },
};

/** Bosses de modelo SEM osso — movimento PROCEDURAL (glb-static-boss).
 *  VAZIO: kaiju/samurai voltaram pro caminho ANIMADO (rig Universal + UAL, igual
 *  o Kael). Os placeholders estáticos (kaiju.glb 14,5MB / samurai.glb) ficavam
 *  invisível/sem animação e pesavam. Kaiju = Imp (demônio animado), samurai =
 *  humanoide animado — ambos escalados por `bossScale`. Re-adicionar aqui só se
 *  um dia houver um modelo estático de propósito. */
const STATIC_BOSS: Record<string, { url: string; height: number; yaw?: number; tint?: string; groundBias?: number }> = {
  // VAZIO: kaiju agora é o Wukong (ossos Unreal → UAL, via RAIDER_GLB). insectoid/
  // tribal-bug aposentados (rig próprio sem walk, bugavam).
};

/** Raiders com skin GLB (humanoides). Reversível: false volta pro procedural. */
const USE_GLB_BOSS = true;
/** Gasmask REVERTIDO (Pedro: tosco, vinha com uma TV junto + rig Valve torto).
 *  Batedor volta pro Quaternius que anima bem. Mantido OFF por segurança. */
const USE_GLB_GASMASK = false;
const GASMASK_URL = '/models/raiders/gasmask.glb';
const IMP_URL = '/models/Imp.glb';
const BOSS_GLB_SCALE = 2.5; // ajustável: tamanho do Imp como boss
const BOSS_GLB_YAW = 0;
const DEFAULT_RAIDER_GLB = '/models/raiders/Male_Peasant.gltf';
/** Modelo GLB por espécie. Male_Ranger é EXCLUSIVO do player — raiders usam outros.
 *  (todos rig Universal → animam com a UAL, igual o Kael). */
const RAIDER_GLB: Record<string, string> = {
  raider_warlord: IMP_URL,
  raider_mushroom: IMP_URL, // boss maior — mesmo rig que já temos, só escala
  raider_kaiju: '/models/bosses/wukong.glb', // Wukong (Niu Mo Wang) — ossos Unreal → UAL (anda+ataca). bossScale pode precisar ajuste
  raider_puglin: '/models/raiders/puglin.glb', // minion Unreal → UAL (anda+ataca)
  raider_samurai: '/models/raiders/Male_Peasant.gltf', // humanoide animado (bossScale 1.7)
  raider_scout: '/models/raiders/Male_Peasant.gltf',
  raider_warrior: '/models/raiders/Female_Peasant.gltf',
  raider_shaman: '/models/raiders/Female_Ranger.gltf',
};
import { mixColor, terrainHeight, type Palette } from './world-kit';

type Weapon = 'dagger' | 'axe' | 'club' | 'staff';

type Species = {
  scale: number;
  bodyWidth: number;
  bodyDepth: number;
  weapon: Weapon;
  hood: boolean;
  shoulders: boolean;
  charm: boolean;
  /** Mini-boss: gira o torso (redemoinho) como o especial do herói. */
  boss?: boolean;
  /** Escala do GLB quando boss (sobrepõe BOSS_GLB_SCALE). */
  bossScale?: number;
  tuning: HostileTuning;
};

/**
 * `leashRange` é curto de propósito: saqueador DEFENDE o acampamento, não caça
 * pelo mapa. Com 26 (valor inicial) ele perseguia o jogador os ~24 m até a base
 * e continuava batendo enquanto ele descansava, o que anulava o recuo do piloto
 * automático. O lobo mantém os 25 originais — ele é bicho solto no vale.
 */
const base = {
  wanderSpeed: 1.0,
  leashRange: 14,
  chaseTimeout: 13,
} as const;

export const RAIDER_SPECIES: Record<string, Species> = {
  raider_scout: {
    scale: 0.82, bodyWidth: 0.52, bodyDepth: 0.32, weapon: 'dagger',
    hood: false, shoulders: false, charm: false,
    tuning: {
      ...base, speed: 4.6, aggroRange: 12, attackRange: 2.2, leashRange: 16,
      chaseTimeout: 15, provokeRange: 22, walkSpeedChase: 18, walkSpeedIdle: 9,
      hitVerb: 'cortou',
    },
  },
  raider_warrior: {
    scale: 1, bodyWidth: 0.62, bodyDepth: 0.36, weapon: 'axe',
    hood: false, shoulders: true, charm: false,
    tuning: {
      ...base, speed: 3.8, aggroRange: 11, attackRange: 2.5, leashRange: 14,
      chaseTimeout: 13, provokeRange: 20, walkSpeedChase: 16, walkSpeedIdle: 8,
      hitVerb: 'golpeou',
    },
  },
  raider_brute: {
    scale: 1.32, bodyWidth: 0.82, bodyDepth: 0.46, weapon: 'club',
    hood: false, shoulders: true, charm: false,
    tuning: {
      ...base, speed: 3.0, aggroRange: 9, attackRange: 2.9, leashRange: 11,
      chaseTimeout: 16, provokeRange: 18, walkSpeedChase: 11, walkSpeedIdle: 6,
      hitVerb: 'esmagou',
    },
  },
  raider_shaman: {
    scale: 0.95, bodyWidth: 0.55, bodyDepth: 0.33, weapon: 'staff',
    hood: true, shoulders: false, charm: true,
    tuning: {
      ...base, speed: 3.4, aggroRange: 13, attackRange: 3.2, leashRange: 13,
      chaseTimeout: 12, provokeRange: 24, walkSpeedChase: 14, walkSpeedIdle: 7,
      hitVerb: 'amaldiçoou',
    },
  },
  // Puglin (kit Bestiary, esqueleto Unreal → anima com a UAL igual o warlord):
  // minion atarracado, animado de verdade (anda + ataca). bodyWidth/Depth só
  // valem se o GLB estiver OFF.
  raider_puglin: {
    scale: 1.3, bodyWidth: 0.6, bodyDepth: 0.4, weapon: 'axe',
    hood: false, shoulders: false, charm: false,
    tuning: {
      ...base, speed: 3.6, aggroRange: 10, attackRange: 2.2, leashRange: 15,
      chaseTimeout: 13, provokeRange: 20, walkSpeedChase: 15, walkSpeedIdle: 8,
      hitVerb: 'mordeu',
    },
  },
  // Mini-boss: 2,5× o brutamontes (1.32 → 3.3). Caça pelo mapa (leash longo),
  // reage de longe e gira num redemoinho ao golpear.
  raider_warlord: {
    scale: 3.3, bodyWidth: 0.95, bodyDepth: 0.55, weapon: 'club',
    hood: false, shoulders: true, charm: false, boss: true, bossScale: 2.5,
    tuning: {
      // Caçador implacável: aggro largo, NÃO desiste (timeout enorme) e rápido o
      // bastante pra alcançar e bater como os outros — com o giro por cima.
      ...base, speed: 3.9, aggroRange: 30, attackRange: 4.5, leashRange: 400,
      chaseTimeout: 600, provokeRange: 45, walkSpeedChase: 13, walkSpeedIdle: 5,
      hitVerb: 'esmagou',
    },
  },
  // Boss MAIOR (~1,5× o Colosso): mesmo rig/giro, mais lento, alcance maior.
  raider_mushroom: {
    scale: 3.3, bodyWidth: 0.95, bodyDepth: 0.55, weapon: 'club',
    hood: false, shoulders: true, charm: false, boss: true, bossScale: 3.75,
    tuning: {
      ...base, speed: 3.4, aggroRange: 34, attackRange: 6, leashRange: 400,
      chaseTimeout: 600, provokeRange: 50, walkSpeedChase: 11, walkSpeedIdle: 4,
      hitVerb: 'esmagou',
    },
  },
  // Boss GIGANTE (~1,5× o Fúngico): o maior da horda.
  raider_kaiju: {
    scale: 3.3, bodyWidth: 0.95, bodyDepth: 0.55, weapon: 'club',
    hood: false, shoulders: true, charm: false, boss: true, bossScale: 5.6,
    tuning: {
      ...base, speed: 3.0, aggroRange: 40, attackRange: 8, leashRange: 400,
      chaseTimeout: 600, provokeRange: 60, walkSpeedChase: 9, walkSpeedIdle: 3.5,
      hitVerb: 'esmagou',
    },
  },
  // Boss NOVO (somado, não substitui): Samurai Caído — ágil, golpe forte.
  raider_samurai: {
    scale: 3.3, bodyWidth: 0.9, bodyDepth: 0.5, weapon: 'club',
    hood: false, shoulders: true, charm: false, boss: true, bossScale: 1.7,
    tuning: {
      ...base, speed: 4.1, aggroRange: 32, attackRange: 5, leashRange: 400,
      chaseTimeout: 600, provokeRange: 48, walkSpeedChase: 14, walkSpeedIdle: 6,
      hitVerb: 'retalhou',
    },
  },
};

export function isRaider(speciesId: string) {
  return Object.prototype.hasOwnProperty.call(RAIDER_SPECIES, speciesId);
}

/* ------------------------------------------------------------------ *
 * Geometrias e materiais compartilhados
 * ------------------------------------------------------------------ */
type Kit = {
  box: THREE.BoxGeometry;
  cyl: THREE.CylinderGeometry;
  cone: THREE.ConeGeometry;
  sphere: THREE.SphereGeometry;
  hide: THREE.MeshStandardMaterial;
  hideDark: THREE.MeshStandardMaterial;
  skin: THREE.MeshStandardMaterial;
  paint: THREE.MeshStandardMaterial;
  bone: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  charm: THREE.MeshStandardMaterial;
  eye: THREE.MeshStandardMaterial;
};

let kitCache: { key: string; kit: Kit } | null = null;

function raiderKit(c: Palette): Kit {
  const key = JSON.stringify(c);
  if (kitCache && kitCache.key === key) return kitCache.kit;
  const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, flatShading: true, ...extra });
  const kit: Kit = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(0.44, 0.5, 1, 8),
    cone: new THREE.ConeGeometry(0.5, 1, 8),
    sphere: new THREE.SphereGeometry(0.5, 10, 8),
    hide: std(mixColor(c.trunk, c.dark, 0.35)),
    hideDark: std(c.dark),
    skin: std(mixColor(c.rock, c.trunk, 0.45)),
    paint: std(c.cloak),
    bone: std(c['rock-light']),
    metal: std(c.metal, { metalness: 0.78, roughness: 0.32 }),
    wood: std(c.trunk),
    charm: std(c.crystal, { emissive: new THREE.Color(c.crystal), emissiveIntensity: 0.5 }),
    eye: std(c.crystal, { emissive: new THREE.Color(c.crystal), emissiveIntensity: 0.6 }),
  };
  kitCache = { key, kit };
  return kit;
}

// Static costume details are batched by material: three draws per costume,
// regardless of the number of rivets and plates. Animation pivots stay intact.
const costumeCache = new Map<string, THREE.BufferGeometry[]>();
function costumeGeometry(spec: Species, kit: Kit) {
  const key = `${spec.bodyWidth}|${spec.bodyDepth}|${spec.hood}|${spec.shoulders}|${spec.boss}`;
  const cached = costumeCache.get(key);
  if (cached) return cached;
  const layers: THREE.BufferGeometry[][] = [[], [], []];
  const add = (layer: number, source: THREE.BufferGeometry, p: [number, number, number], s: [number, number, number], rz = 0) => {
    const g = source.clone();
    g.scale(s[0], s[1], s[2]); g.rotateZ(rz); g.translate(p[0], p[1], p[2]);
    layers[layer]!.push(g);
  };
  const w = spec.bodyWidth, d = spec.bodyDepth;
  add(0, kit.sphere, [0, 1.02, 0.03], [w * 1.12, 0.48, d * 1.16]);
  add(0, kit.box, [0, 0.66, 0], [w * 1.07, 0.1, d * 1.08]);
  add(1, kit.box, [0, 0.66, d / 2 + 0.035], [0.14, 0.12, 0.07]);
  add(2, kit.box, [0, 0.48, d / 2], [w * 0.38, 0.3, 0.06]);
  add(2, kit.cone, [0, 0.84, -d * 0.64], [w * 1.12, 0.78, 0.12]);
  for (const side of [-1, 1]) {
    add(0, kit.box, [side * w * 0.3, 0.61, 0], [w * 0.36, 0.24, d * 1.12], side * 0.12);
    add(1, kit.box, [side * 0.13, 1.47, 0.217], [0.12, 0.21, 0.035], side * 0.13);
    if (spec.shoulders) {
      add(0, kit.sphere, [side * (w / 2 + 0.04), 1.2, 0], [0.34, 0.22, 0.34]);
      add(1, kit.cone, [side * (w / 2 + 0.06), 1.38, -0.02], [0.08, spec.boss ? 0.35 : 0.21, 0.08], -side * 0.3);
    }
    for (let i = 0; i < 3; i++) {
      add(1, kit.sphere, [side * w * 0.33, 0.88 + i * 0.1, d / 2 + 0.04], [0.035, 0.035, 0.025]);
    }
  }
  const result = layers.map(parts => {
    const merged = mergeGeometries(parts)!;
    parts.forEach(part => part.dispose());
    return merged;
  });
  costumeCache.set(key, result);
  return result;
}

function Weaponry({ weapon, kit }: { weapon: Weapon; kit: Kit }) {
  if (weapon === 'dagger') {
    return (
      <>
        <mesh geometry={kit.box} material={kit.wood} position={[0, 0, 0.1]} scale={[0.07, 0.07, 0.2]} />
        <mesh geometry={kit.box} material={kit.metal} position={[0, 0, 0.42]} scale={[0.05, 0.11, 0.45]} castShadow />
      </>
    );
  }
  if (weapon === 'axe') {
    return (
      <>
        <mesh geometry={kit.cyl} material={kit.wood} position={[0, 0, 0.42]} rotation={[Math.PI / 2, 0, 0]} scale={[0.1, 0.9, 0.1]} castShadow />
        <mesh geometry={kit.box} material={kit.metal} position={[0.13, 0, 0.78]} scale={[0.3, 0.34, 0.08]} castShadow />
        <mesh geometry={kit.box} material={kit.bone} position={[0, 0, 0.88]} scale={[0.08, 0.1, 0.16]} />
      </>
    );
  }
  if (weapon === 'club') {
    return (
      <>
        <mesh geometry={kit.cyl} material={kit.wood} position={[0, 0, 0.45]} rotation={[Math.PI / 2, 0, 0]} scale={[0.16, 1.0, 0.16]} castShadow />
        <mesh geometry={kit.sphere} material={kit.bone} position={[0, 0, 0.95]} scale={[0.36, 0.34, 0.4]} castShadow />
        {[0, 1, 2].map(i => (
          <mesh
            key={i}
            geometry={kit.cone}
            material={kit.metal}
            position={[Math.cos(i * 2.1) * 0.16, Math.sin(i * 2.1) * 0.16, 0.95]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[0.12, 0.2, 0.12]}
          />
        ))}
      </>
    );
  }
  return (
    <>
      <mesh geometry={kit.cyl} material={kit.wood} position={[0, 0.18, 0.3]} rotation={[Math.PI / 2.6, 0, 0]} scale={[0.08, 1.9, 0.08]} castShadow />
      <mesh geometry={kit.sphere} material={kit.charm} position={[0, 0.95, 0.72]} scale={[0.19, 0.19, 0.19]} />
      <mesh geometry={kit.cone} material={kit.bone} position={[0, 0.78, 0.68]} rotation={[0, 0, Math.PI]} scale={[0.14, 0.2, 0.14]} />
    </>
  );
}

export function Raider({
  c, creatureId, speciesId, name, start, playerRef,
}: {
  c: Palette;
  creatureId: string;
  speciesId: string;
  name: string;
  start: Position;
  playerRef: React.RefObject<THREE.Group | null>;
}) {
  const kit = useMemo(() => raiderKit(c), [c]);
  const spec = RAIDER_SPECIES[speciesId] ?? RAIDER_SPECIES['raider_warrior']!;
  const costume = useMemo(() => costumeGeometry(spec, kit), [spec, kit]);

  const ref = useRef<THREE.Group>(null);
  const bossAction = useRef<HeroAction>('idle');
  const bossMoving = useRef(false); // p/ boss-criatura (GlbCreature, anda/para)
  const leftLeg = useRef<THREE.Mesh>(null);
  const rightLeg = useRef<THREE.Mesh>(null);
  const leftArm = useRef<THREE.Mesh>(null);
  const weaponArm = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const spin = useRef(0);
  const spinActive = useRef(0); // tempo restante do golpe giratório (s)
  const spinCd = useRef(2);     // tempo até o próximo giro (s)
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
    onAnimate: (anim, dt) => {
      bossAction.current = (anim.swing > 0 || spinActive.current > 0) ? 'attack' : anim.moving ? 'walk' : 'idle';
      bossMoving.current = anim.moving;
      const swing = anim.moving ? Math.sin(anim.walkCycle) * 0.6 : 0;
      if (leftLeg.current) leftLeg.current.rotation.x = swing;
      if (rightLeg.current) rightLeg.current.rotation.x = -swing;

      if (spec.boss) {
        // Golpe giratório COM cooldown: gira forte por ~0.6 s e só repete a cada
        // ~5 s. No meio, ataque normal (igual aos outros). Nunca gira eterno.
        spinCd.current -= dt;
        const inRange = anim.distToPlayer <= spec.tuning.attackRange + 1.5;
        if (spinActive.current <= 0 && spinCd.current <= 0 && inRange) {
          spinActive.current = 0.6; // duração do redemoinho
          spinCd.current = 5;       // próximo giro só daqui ~5 s
        }
        if (spinActive.current > 0) {
          spinActive.current -= dt;
          spin.current += dt * 18;
          if (weaponArm.current) weaponArm.current.rotation.x = -1.35;
          if (leftArm.current) leftArm.current.rotation.x = -1.2;
        } else {
          // Alinha ao giro completo mais próximo → encara pra frente e ataca normal.
          const target = Math.round(spin.current / (Math.PI * 2)) * (Math.PI * 2);
          spin.current += (target - spin.current) * Math.min(1, dt * 8);
          if (Math.abs(spin.current - target) < 0.01) spin.current = 0;
          const strike = anim.swing > 0 ? Math.sin((0.35 - anim.swing) / 0.35 * Math.PI) : 0;
          if (weaponArm.current) weaponArm.current.rotation.x = -1.5 * strike + swing * 0.35;
          if (leftArm.current) leftArm.current.rotation.x = -swing * 0.5;
        }
        if (torso.current) {
          torso.current.rotation.y = spin.current;
          torso.current.position.y = anim.moving ? Math.abs(Math.sin(anim.walkCycle * 2)) * 0.04 : 0;
          torso.current.rotation.z = 0;
        }
        return;
      }

      if (leftArm.current) leftArm.current.rotation.x = -swing * 0.5;
      // Golpe: levanta a arma e volta.
      if (weaponArm.current) {
        const strike = anim.swing > 0 ? Math.sin((0.35 - anim.swing) / 0.35 * Math.PI) : 0;
        weaponArm.current.rotation.x = -1.5 * strike + swing * 0.35;
      }
      if (torso.current) {
        torso.current.position.y = anim.moving ? Math.abs(Math.sin(anim.walkCycle * 2)) * 0.04 : 0;
        torso.current.rotation.z = anim.chasing ? Math.sin(anim.walkCycle * 0.5) * 0.04 : 0;
      }
      void dt;
    },
  });

  const y = terrainHeight(start.x, start.z);
  // escala VISUAL (bosses GLB usam bossScale; o resto, a escala da espécie).
  const s = spec.boss ? (spec.bossScale ?? BOSS_GLB_SCALE) : spec.scale;
  const w = spec.bodyWidth;
  const d = spec.bodyDepth;
  // Boss GLB próprio (estático ou criatura) dimensiona rótulo/anel pela altura real.
  const sbDef = STATIC_BOSS[speciesId] ?? CREATURE_BOSS[speciesId];
  const labelScale = sbDef ? sbDef.height / 2 : s;

  return (
    <group ref={ref} position={[start.x, y, start.z]} onPointerDown={onClick}>
      <SelectionRing ring={ring} radius={0.55 * labelScale} c={c} />
      <EnemyLabel name={name} height={2.15 * labelScale} hpGroup={hpGroup} label={label} hpFill={hpFill} c={c} />

      {USE_GLB_BOSS && (() => {
        // Boss de MONSTRO com rig+anim próprios (insectoid) → renderer de criatura.
        const cb = CREATURE_BOSS[speciesId];
        if (cb) {
          return <GlbCreature url={cb.url} movingRef={bossMoving} height={cb.height} yaw={cb.yaw ?? Math.PI} tint={cb.tint} groundBias={cb.groundBias ?? 0} />;
        }
        // Boss de modelo SEM osso → movimento PROCEDURAL (glb-static-boss).
        const sb = STATIC_BOSS[speciesId];
        if (sb) {
          return <GlbStaticBoss url={sb.url} actionRef={bossAction} height={sb.height} yaw={sb.yaw ?? 0} tint={sb.tint} groundBias={sb.groundBias ?? 0} />;
        }
        // Demais raiders/bosses: rig Universal + UAL (anima pernas).
        return (
          <GlbHero
            charUrl={RAIDER_GLB[speciesId] ?? DEFAULT_RAIDER_GLB}
            actionRef={bossAction}
            scale={spec.boss ? (spec.bossScale ?? BOSS_GLB_SCALE) : spec.scale}
            yaw={BOSS_GLB_YAW}
          />
        );
      })()}

      {/* Procedural só é MONTADO quando o GLB está OFF (perf — GPT: antes ficava
          invisível porém montado, dezenas de meshes à toa por raider). */}
      {!USE_GLB_BOSS && (
      <group scale={s}>
        <group ref={torso}>
          <mesh geometry={costume[0]!} material={kit.metal} castShadow />
          <mesh geometry={costume[1]!} material={kit.bone} castShadow />
          <mesh geometry={costume[2]!} material={kit.paint} castShadow />
          {/* Pernas */}
          <mesh ref={leftLeg} geometry={kit.box} material={kit.hideDark} position={[-0.14 * (w / 0.62), 0.3, 0]} scale={[0.2, 0.6, 0.22]} castShadow />
          <mesh ref={rightLeg} geometry={kit.box} material={kit.hideDark} position={[0.14 * (w / 0.62), 0.3, 0]} scale={[0.2, 0.6, 0.22]} castShadow />

          {/* Tronco */}
          <mesh geometry={kit.box} material={kit.hide} position={[0, 0.9, 0]} scale={[w, 0.67, d]} castShadow />
          {/* Tira de couro cruzada */}
          <mesh geometry={kit.box} material={kit.hideDark} position={[0, 0.9, d / 2 + 0.01]} rotation={[0, 0, 0.5]} scale={[0.1, 0.9, 0.02]} />

          {/* Ombreiras de osso */}
          {spec.shoulders && [-1, 1].map(sx => (
            <mesh key={sx} geometry={kit.sphere} material={kit.bone} position={[sx * (w / 2 + 0.04), 1.17, 0]} scale={[0.26, 0.18, 0.26]} castShadow />
          ))}

          {/* Cabeça */}
          <mesh geometry={kit.sphere} material={kit.skin} position={[0, 1.48, 0]} scale={[0.46, 0.48, 0.44]} castShadow />
          {/* Pintura de guerra */}
          <mesh geometry={kit.box} material={kit.paint} position={[0, 1.5, 0.205]} scale={[0.44, 0.09, 0.02]} />
          <mesh geometry={kit.box} material={kit.paint} position={[0, 1.36, 0.205]} scale={[0.12, 0.14, 0.02]} />
          {/* Olhos */}
          {[-0.1, 0.1].map(ex => (
            <mesh key={ex} geometry={kit.box} material={kit.eye} position={[ex, 1.55, 0.21]} scale={[0.08, 0.05, 0.02]} />
          ))}
          {/* Capuz do xamã / rabo de cavalo do batedor */}
          {spec.hood ? (
            <mesh geometry={kit.cone} material={kit.hideDark} position={[0, 1.72, -0.03]} scale={[0.72, 0.6, 0.72]} castShadow />
          ) : (
            <mesh geometry={kit.box} material={kit.hideDark} position={[0, 1.6, -0.22]} rotation={[0.4, 0, 0]} scale={[0.14, 0.42, 0.1]} />
          )}
          {/* Amuleto totêmico */}
          {spec.charm && (
            <mesh geometry={kit.sphere} material={kit.charm} position={[0, 1.08, d / 2 + 0.04]} scale={[0.11, 0.11, 0.11]} />
          )}

          {/* Braço esquerdo */}
          <mesh ref={leftArm} geometry={kit.cyl} material={kit.skin} position={[-(w / 2 + 0.12), 0.92, 0.05]} rotation={[0, 0, -0.15]} scale={[0.22, 0.6, 0.22]} castShadow />

          {/* Braço direito + arma */}
          <group ref={weaponArm} position={[w / 2 + 0.1, 1, 0.12]}>
            <mesh geometry={kit.cyl} material={kit.skin} position={[0, -0.05, 0.05]} rotation={[0.5, 0, 0.12]} scale={[0.22, 0.6, 0.22]} castShadow />
            <Weaponry weapon={spec.weapon} kit={kit} />
          </group>
        </group>
      </group>
      )}
    </group>
  );
}
