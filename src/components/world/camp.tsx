/**
 * Acampamento inimigo no mundo 3D.
 *
 * Mesma linguagem visual de `Ruins`/`Tree`: primitivas baixas-poli, flat
 * shading, cores vindas de `palette()` (tokens `--world-*`). Cada estrutura
 * senta na altura real do terreno.
 *
 * As estruturas vêm de `CampDefinition.structures` quando os dados existem;
 * sem eles, um layout procedural derivado do tier mantém o mundo jogável.
 *
 * Acampamento limpo continua visível, mas apagado: fogueira em brasa, bandeira
 * caída, paleta puxada para `--world-dark`.
 */
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useCallback, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { CampState, CampStructure } from '@/game/types';
import { addObjective, campDefinition } from './objective-bridge';
import { useFadeGroup, type FadeSphere } from './occlusion';
import { hashId, markPointerConsumed, mixColor, rand, terrainHeight, type Palette } from './world-kit';

/* ------------------------------------------------------------------ *
 * Layout procedural (fallback)
 * ------------------------------------------------------------------ */
/** `CampState` não carrega o raio — vem da definição, ou do tier como reserva. */
function campRadius(camp: CampState): number {
  return campDefinition(camp.defId)?.radius ?? 5 + camp.tier * 1.5;
}

function proceduralStructures(camp: CampState, radius: number): CampStructure[] {
  const seed = hashId(camp.id);
  const r = Math.max(4, radius);
  const out: CampStructure[] = [
    { kind: 'bonfire', offset: { x: 0, z: 0 }, rotation: 0, scale: 1 },
  ];

  const tents = 1 + camp.tier;
  for (let i = 0; i < tents; i++) {
    const a = (i / tents) * Math.PI * 2 + rand(seed + i) * 0.5;
    out.push({
      kind: 'tent',
      offset: { x: Math.cos(a) * r * 0.42, z: Math.sin(a) * r * 0.42 },
      rotation: -a + Math.PI / 2,
      scale: 0.9 + rand(seed + i + 40) * 0.25,
    });
  }

  const towers = camp.tier >= 3 ? 2 : camp.tier >= 2 ? 1 : 0;
  for (let i = 0; i < towers; i++) {
    const a = Math.PI * 0.35 + i * Math.PI;
    out.push({
      kind: 'watchtower',
      offset: { x: Math.cos(a) * r * 0.78, z: Math.sin(a) * r * 0.78 },
      rotation: -a,
      scale: 1,
    });
  }

  const walls = 5 + camp.tier * 2;
  for (let i = 0; i < walls; i++) {
    const a = Math.PI * 0.85 + (i / walls) * Math.PI * 1.1;
    out.push({
      kind: 'palisade',
      offset: { x: Math.cos(a) * r * 0.82, z: Math.sin(a) * r * 0.82 },
      rotation: -a + Math.PI / 2,
      scale: 1,
    });
  }

  if (camp.tier >= 3) {
    out.push({ kind: 'totem', offset: { x: r * 0.22, z: -r * 0.3 }, rotation: 0.4, scale: 1 });
  }
  if (camp.tier >= 4) {
    out.push({ kind: 'cage', offset: { x: -r * 0.3, z: r * 0.28 }, rotation: -0.3, scale: 1 });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Kit compartilhado
 * ------------------------------------------------------------------ */
type CampKit = {
  box: THREE.BoxGeometry;
  cyl: THREE.CylinderGeometry;
  cone: THREE.ConeGeometry;
  sphere: THREE.SphereGeometry;
  wood: THREE.MeshStandardMaterial;
  woodDark: THREE.MeshStandardMaterial;
  hide: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  bone: THREE.MeshStandardMaterial;
  banner: THREE.MeshStandardMaterial;
  ember: THREE.MeshStandardMaterial;
  flame: THREE.MeshStandardMaterial;
};

const kitCache = new Map<string, CampKit>();

function campKit(c: Palette, cleared: boolean): CampKit {
  const key = `${c.trunk}|${cleared ? 'off' : 'on'}`;
  const hit = kitCache.get(key);
  if (hit) return hit;
  const fade = (color: string) => (cleared ? mixColor(color, c.dark, 0.5) : color);
  const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color: fade(color), flatShading: true, ...extra });

  const kit: CampKit = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
    cone: new THREE.ConeGeometry(0.5, 1, 5),
    sphere: new THREE.SphereGeometry(0.5, 6, 5),
    wood: std(c.trunk),
    woodDark: std(mixColor(c.trunk, c.dark, 0.45)),
    hide: std(mixColor(c.path, c.trunk, 0.45)),
    stone: std(c.rock),
    bone: std(c['rock-light']),
    banner: std(c.cloak),
    ember: std(cleared ? mixColor(c.rock, c.dark, 0.6) : '#512017'),
    flame: cleared
      ? new THREE.MeshStandardMaterial({ color: mixColor(c.rock, c.dark, 0.7), flatShading: true })
      : new THREE.MeshStandardMaterial({
        color: '#ff6622', emissive: new THREE.Color('#ff4400'), emissiveIntensity: 2,
        transparent: true, opacity: 0.85, flatShading: true,
      }),
  };
  kitCache.set(key, kit);
  return kit;
}

/* ------------------------------------------------------------------ *
 * Estruturas
 * ------------------------------------------------------------------ */
function Tent({ kit }: { kit: CampKit }) {
  return (
    <group>
      {[-1, 1].map(side => (
        <mesh
          key={side}
          geometry={kit.box}
          material={kit.hide}
          position={[side * 0.5, 0.6, 0]}
          rotation={[0, 0, side * -0.72]}
          scale={[0.08, 1.75, 2.1]}
          castShadow
        />
      ))}
      <mesh geometry={kit.cyl} material={kit.wood} position={[0, 0.65, 1.02]} rotation={[0.25, 0, 0]} scale={[0.09, 1.45, 0.09]} castShadow />
      <mesh geometry={kit.box} material={kit.woodDark} position={[0, 0.5, -1.02]} scale={[1.5, 1.0, 0.07]} />
      <mesh geometry={kit.box} material={kit.bone} position={[0, 1.42, 1.0]} scale={[0.1, 0.2, 0.1]} />
    </group>
  );
}

function Watchtower({ kit, cleared, bannerRef }: { kit: CampKit; cleared: boolean; bannerRef: React.RefObject<THREE.Mesh | null> }) {
  return (
    <group>
      {[[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]].map(([x, z], i) => (
        <mesh key={i} geometry={kit.cyl} material={kit.wood} position={[x ?? 0, 1.4, z ?? 0]} scale={[0.13, 2.8, 0.13]} castShadow />
      ))}
      <mesh geometry={kit.box} material={kit.woodDark} position={[0, 2.85, 0]} scale={[1.65, 0.14, 1.65]} castShadow receiveShadow />
      <mesh geometry={kit.box} material={kit.wood} position={[0, 3.15, -0.8]} scale={[1.65, 0.5, 0.1]} />
      <mesh geometry={kit.cone} material={kit.hide} position={[0, 3.6, 0]} scale={[2.2, 1.0, 2.2]} castShadow />
      <mesh geometry={kit.box} material={kit.wood} position={[0, 1.4, 0.62]} rotation={[0, 0, 0.6]} scale={[0.1, 2.9, 0.1]} />
      {/* Bandeira: em pé no acampamento ativo, caída quando limpo */}
      <mesh
        ref={bannerRef}
        geometry={kit.box}
        material={kit.banner}
        position={cleared ? [0.55, 0.12, 0.9] : [0.72, 3.45, 0]}
        rotation={cleared ? [0, 0.4, Math.PI / 2] : [0, 0, 0]}
        scale={[0.03, 0.9, 0.55]}
      />
    </group>
  );
}

function Palisade({ kit }: { kit: CampKit }) {
  return (
    <group>
      {[-0.42, 0, 0.42].map((x, i) => (
        <group key={x} position={[x, 0, (i % 2) * 0.06]}>
          <mesh geometry={kit.cyl} material={kit.wood} position={[0, 0.85, 0]} scale={[0.2, 1.7, 0.2]} castShadow />
          <mesh geometry={kit.cone} material={kit.woodDark} position={[0, 1.82, 0]} scale={[0.2, 0.4, 0.2]} />
        </group>
      ))}
      <mesh geometry={kit.box} material={kit.woodDark} position={[0, 1.1, 0.12]} scale={[1.2, 0.09, 0.06]} />
    </group>
  );
}

function Bonfire({ kit, cleared, flameRef }: { kit: CampKit; cleared: boolean; flameRef: React.RefObject<THREE.Group | null> }) {
  return (
    <group>
      {[0, 1.2, 2.4, 3.6, 5].map((a, i) => (
        <mesh
          key={i}
          geometry={kit.box}
          material={kit.stone}
          position={[Math.cos(a) * 0.55, 0.12, Math.sin(a) * 0.55]}
          rotation={[0, a, 0]}
          scale={[0.26, 0.24, 0.42]}
          castShadow
        />
      ))}
      {[0.5, -0.5].map((r, i) => (
        <mesh key={i} geometry={kit.cyl} material={kit.ember} position={[0, 0.2, 0]} rotation={[Math.PI / 2.4, r * 2, 0]} scale={[0.1, 1.1, 0.1]} castShadow />
      ))}
      {!cleared && (
        <group ref={flameRef} position={[0, 0.45, 0]}>
          <mesh geometry={kit.cone} material={kit.flame} scale={[0.5, 1.1, 0.5]} />
          <mesh geometry={kit.cone} material={kit.flame} position={[0.12, 0.25, -0.08]} scale={[0.3, 0.7, 0.3]} />
        </group>
      )}
      {cleared && (
        <mesh geometry={kit.sphere} material={kit.ember} position={[0, 0.1, 0]} scale={[0.6, 0.12, 0.6]} />
      )}
    </group>
  );
}

function Totem({ kit }: { kit: CampKit }) {
  return (
    <group>
      <mesh geometry={kit.cyl} material={kit.wood} position={[0, 1.3, 0]} scale={[0.46, 2.6, 0.46]} castShadow />
      {[0.7, 1.4, 2.1].map((y, i) => (
        <mesh key={y} geometry={kit.box} material={i % 2 ? kit.woodDark : kit.banner} position={[0, y, 0]} scale={[0.56, 0.16, 0.56]} />
      ))}
      <mesh geometry={kit.box} material={kit.woodDark} position={[0, 2.0, 0]} scale={[1.5, 0.11, 0.11]} castShadow />
      <mesh geometry={kit.sphere} material={kit.bone} position={[0, 2.75, 0.05]} scale={[0.34, 0.38, 0.34]} castShadow />
      {[-0.1, 0.1].map(x => (
        <mesh key={x} geometry={kit.box} material={kit.ember} position={[x, 2.8, 0.22]} scale={[0.08, 0.08, 0.04]} />
      ))}
      {[-0.68, 0.68].map(x => (
        <mesh key={x} geometry={kit.cone} material={kit.bone} position={[x, 1.88, 0]} rotation={[Math.PI, 0, 0]} scale={[0.12, 0.3, 0.12]} />
      ))}
    </group>
  );
}

function Cage({ kit }: { kit: CampKit }) {
  return (
    <group>
      <mesh geometry={kit.box} material={kit.woodDark} position={[0, 0.07, 0]} scale={[1.5, 0.14, 1.5]} receiveShadow />
      {[-0.68, -0.23, 0.23, 0.68].map(x => (
        <mesh key={`a${x}`} geometry={kit.cyl} material={kit.wood} position={[x, 0.85, -0.7]} scale={[0.08, 1.6, 0.08]} castShadow />
      ))}
      {[-0.68, -0.23, 0.23, 0.68].map(x => (
        <mesh key={`b${x}`} geometry={kit.cyl} material={kit.wood} position={[x, 0.85, 0.7]} scale={[0.08, 1.6, 0.08]} castShadow />
      ))}
      {[-0.7, 0.7].map(x => (
        <mesh key={`c${x}`} geometry={kit.box} material={kit.wood} position={[x, 0.85, 0]} scale={[0.08, 1.6, 1.4]} />
      ))}
      <mesh geometry={kit.box} material={kit.woodDark} position={[0, 1.66, 0]} scale={[1.5, 0.12, 1.5]} castShadow />
      <mesh geometry={kit.box} material={kit.bone} position={[0, 0.3, 0]} scale={[0.5, 0.3, 0.5]} />
    </group>
  );
}

function Structure({ s, kit, cleared, flameRef, bannerRef }: {
  s: CampStructure;
  kit: CampKit;
  cleared: boolean;
  flameRef: React.RefObject<THREE.Group | null>;
  bannerRef: React.RefObject<THREE.Mesh | null>;
}) {
  switch (s.kind) {
    case 'tent': return <Tent kit={kit} />;
    case 'watchtower': return <Watchtower kit={kit} cleared={cleared} bannerRef={bannerRef} />;
    case 'palisade': return <Palisade kit={kit} />;
    case 'bonfire': return <Bonfire kit={kit} cleared={cleared} flameRef={flameRef} />;
    case 'totem': return <Totem kit={kit} />;
    case 'cage': return <Cage kit={kit} />;
    default: return null;
  }
}

/** Esferas que escondem o jogador, por tipo de estrutura (espaço local). */
const FADE_SPHERES: Partial<Record<CampStructure['kind'], FadeSphere[]>> = {
  tent: [[0, 0.7, 0, 1.3]],
  watchtower: [[0, 1.8, 0, 1.6], [0, 3.4, 0, 1.3]],
  palisade: [[0, 0.9, 0, 0.9]],
  totem: [[0, 1.4, 0, 0.8], [0, 2.5, 0, 0.6]],
  cage: [[0, 0.85, 0, 1.0]],
};

/**
 * Grupo de uma estrutura: apaga quando esconde o jogador. Os materiais do kit
 * são compartilhados entre acampamentos, então o registro os clona.
 */
function CampPiece({ spheres, children, ...rest }: {
  spheres: FadeSphere[] | null;
  children: React.ReactNode;
} & React.ComponentProps<'group'>) {
  const ref = useRef<THREE.Group>(null);
  useFadeGroup(ref, spheres, true);
  return <group ref={ref} {...rest}>{children}</group>;
}

/* ------------------------------------------------------------------ *
 * Acampamento
 * ------------------------------------------------------------------ */
export function Camp({ camp, c }: { camp: CampState; c: Palette }) {
  const kit = useMemo(() => campKit(c, camp.cleared), [c, camp.cleared]);
  const flame = useRef<THREE.Group>(null);
  const banner = useRef<THREE.Mesh>(null);

  const radius = useMemo(() => campRadius(camp), [camp.defId, camp.tier]);

  const structures = useMemo(() => {
    const def = campDefinition(camp.defId);
    if (def && def.structures.length > 0) return def.structures;
    return proceduralStructures(camp, radius);
  }, [camp.defId, camp.id, camp.tier, radius]);

  const queueClear = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    markPointerConsumed(e.nativeEvent);
    addObjective('clear_camp', camp.id);
  }, [camp.id]);

  useFrame(({ clock }) => {
    const f = flame.current;
    if (!f) return;
    const t = clock.elapsedTime;
    const pulse = 1 + Math.sin(t * 9 + camp.position.x) * 0.14;
    f.scale.set(pulse, 1 + Math.sin(t * 7) * 0.2, pulse);
    f.rotation.y = t * 1.3;
  });

  const cx = camp.position.x;
  const cz = camp.position.z;
  const markerY = terrainHeight(cx, cz);

  return (
    <group position={[cx, 0, cz]}>
      {/* Marcador de chão: anel clicável que enfileira "limpar acampamento" */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, markerY + 0.045, 0]}
        onPointerDown={queueClear}
      >
        <ringGeometry args={[radius - 0.7, radius, 48]} />
        <meshBasicMaterial
          color={camp.cleared ? c['rock-light'] : c.cloak}
          transparent
          opacity={camp.cleared ? 0.25 : 0.42}
          side={THREE.DoubleSide}
        />
      </mesh>

      {structures.map((s, i) => {
        const wx = cx + s.offset.x;
        const wz = cz + s.offset.z;
        return (
          <CampPiece
            key={`${s.kind}-${i}-${camp.cleared ? 1 : 0}`}
            spheres={FADE_SPHERES[s.kind] ?? null}
            position={[s.offset.x, terrainHeight(wx, wz), s.offset.z]}
            rotation={[0, s.rotation, 0]}
            scale={s.scale}
            onPointerDown={queueClear}
          >
            <Structure s={s} kit={kit} cleared={camp.cleared} flameRef={flame} bannerRef={banner} />
          </CampPiece>
        );
      })}
    </group>
  );
}
