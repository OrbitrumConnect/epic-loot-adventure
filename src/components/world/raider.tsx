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
import type { Position } from '@/game/types';
import { EnemyLabel, SelectionRing } from './enemy-label';
import { useEnemyClick, useHostileAI, type HostileTuning } from './hostile-ai';
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
  // Mini-boss: 2,5× o brutamontes (1.32 → 3.3). Caça pelo mapa (leash longo),
  // reage de longe e gira num redemoinho ao golpear.
  raider_warlord: {
    scale: 3.3, bodyWidth: 0.95, bodyDepth: 0.55, weapon: 'club',
    hood: false, shoulders: true, charm: false, boss: true,
    tuning: {
      ...base, speed: 3.2, aggroRange: 22, attackRange: 4.5, leashRange: 200,
      chaseTimeout: 60, provokeRange: 40, walkSpeedChase: 9, walkSpeedIdle: 4,
      hitVerb: 'esmagou',
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
  const key = `${c.dark}|${c.cloak}|${c.trunk}`;
  if (kitCache && kitCache.key === key) return kitCache.kit;
  const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, flatShading: true, ...extra });
  const kit: Kit = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
    cone: new THREE.ConeGeometry(0.5, 1, 5),
    sphere: new THREE.SphereGeometry(0.5, 6, 5),
    hide: std(mixColor(c.trunk, c.dark, 0.35)),
    hideDark: std(c.dark),
    skin: std(mixColor(c.rock, c.trunk, 0.45)),
    paint: std(c.cloak),
    bone: std(c['rock-light']),
    metal: std(c.metal),
    wood: std(c.trunk),
    charm: std(c.crystal, { emissive: new THREE.Color(c.crystal), emissiveIntensity: 0.5 }),
    eye: std('#f0c45a', { emissive: new THREE.Color('#f0c45a'), emissiveIntensity: 0.6 }),
  };
  kitCache = { key, kit };
  return kit;
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

  const ref = useRef<THREE.Group>(null);
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
  const s = spec.scale;
  const w = spec.bodyWidth;
  const d = spec.bodyDepth;

  return (
    <group ref={ref} position={[start.x, y, start.z]} onPointerDown={onClick}>
      <SelectionRing ring={ring} radius={0.55 * s} c={c} />
      <EnemyLabel name={name} height={2.15 * s} hpGroup={hpGroup} label={label} hpFill={hpFill} c={c} />

      <group scale={s}>
        <group ref={torso}>
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
          <mesh geometry={kit.box} material={kit.skin} position={[0, 1.48, 0]} scale={[0.42, 0.43, 0.4]} castShadow />
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
    </group>
  );
}
