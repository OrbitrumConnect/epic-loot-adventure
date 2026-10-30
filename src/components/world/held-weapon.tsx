/**
 * Item na mão do personagem.
 *
 * O grupo animado de golpe (`sword` ref em `Character`) continua sendo UM só;
 * este componente só troca o que fica dentro dele. A escolha vem da hotbar
 * selecionada (`ui.selectedHotbar` -> slot da hotbar -> item do inventário).
 * Selecionar uma arma/ferramenta já a equipa na store (`useHotbarSlot`), então
 * `equipment.primary` coincide com a seleção; qualquer outro item
 * (poção, recurso, slot vazio) deixa o punho nu.
 *
 * O seletor devolve só uma string curta: re-renderiza APENAS quando o modelo
 * muda, nunca a 60 Hz.
 *
 * Convenção dos modelos: nascem na mão (origem) e crescem em +Z; o balanço
 * gira o grupo em X, então tudo balança igual. Geometria unitária e materiais
 * são compartilhados.
 */
import { useFrame } from '@react-three/fiber';
import { Suspense, useRef } from 'react';
import { PistolModel, RifleModel } from './weapon-models';
import * as THREE from 'three';
import { useGameStore } from '@/game/state/game-store';
import { mixColor, type Palette } from './world-kit';
import { requestLight } from './light-pool';

const tmpTorchV = new THREE.Vector3();

export type HeldKind = 'sword' | 'axe' | 'pickaxe' | 'iron_axe' | 'iron_pickaxe' | 'torch' | 'bow' | 'pistol' | 'rifle' | 'fist';

const KIND_BY_ITEM: Record<string, HeldKind> = {
  iron_sword: 'sword',
  axe: 'axe',
  pickaxe: 'pickaxe',
  iron_axe: 'iron_axe',
  iron_pickaxe: 'iron_pickaxe',
  torch: 'torch',
  bow: 'bow',
  pistol: 'pistol',
  rifle: 'rifle',
};

export function heldKindFor(itemId: string | null | undefined): HeldKind {
  return (itemId ? KIND_BY_ITEM[itemId] : undefined) ?? 'fist';
}

/** Item atualmente selecionado na hotbar (ou null). Puro, testável. */
export function selectedItemId(s: ReturnType<typeof useGameStore.getState>): string | null {
  const inv = s.player.inventory;
  const slotIdx = inv.hotbar.slots[s.ui.selectedHotbar];
  if (slotIdx == null) return null;
  return inv.slots[slotIdx]?.itemId ?? null;
}

/* ------------------------------------------------------------------ *
 * Kit compartilhado
 * ------------------------------------------------------------------ */
const geo = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
  cone: new THREE.ConeGeometry(0.5, 1, 5),
  sphere: new THREE.SphereGeometry(0.5, 6, 5),
};

type Kit = Record<
  'wood' | 'woodDark' | 'steel' | 'ironDark' | 'stone' | 'gold' | 'wrap' | 'glove' | 'flame' | 'flameCore' | 'char',
  THREE.MeshStandardMaterial
>;
const kits = new Map<string, Kit>();

function kitFor(c: Palette): Kit {
  const key = Object.values(c).join('|');
  const hit = kits.get(key);
  if (hit) return hit;
  const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, flatShading: true, ...extra });
  const kit: Kit = {
    wood: std(c.trunk),
    woodDark: std(mixColor(c.trunk, c.dark, 0.4)),
    steel: std(mixColor(c.metal, c.light, 0.38), { metalness: 0.86, roughness: 0.27 }),
    ironDark: std(mixColor(c.metal, c.dark, 0.45), { metalness: 0.8, roughness: 0.4 }),
    stone: std(c['rock-light']),
    gold: std(c.gold, { metalness: 0.78, roughness: 0.3 }),
    wrap: std(c.cloak),
    glove: std(c.armor),
    flame: std(c.crystal, { emissive: new THREE.Color(c.crystal), emissiveIntensity: 2.2 }),
    flameCore: std(c.gold, { emissive: new THREE.Color(c.gold), emissiveIntensity: 2.6 }),
    char: std(mixColor(c.trunk, c.dark, 0.7)),
  };
  kits.set(key, kit);
  return kit;
}

/* ------------------------------------------------------------------ *
 * Modelos
 * ------------------------------------------------------------------ */
type Mat = THREE.MeshStandardMaterial;

/** Cabo ao longo de +Z, de `z0` a `z1`. */
function Handle({ z0, z1, thick, mat }: { z0: number; z1: number; thick: number; mat: Mat }) {
  const len = z1 - z0;
  return (
    <mesh geometry={geo.cyl} material={mat} position={[0, 0, z0 + len / 2]} rotation={[Math.PI / 2, 0, 0]} scale={[thick, len, thick]} castShadow />
  );
}

function Sword({ k }: { k: Kit }) {
  return (
    <>
      <mesh material={k.steel} position={[0, 0, 0.58]} rotation={[Math.PI / 2, Math.PI / 4, 0]} scale={[1, 1, 0.4]} castShadow>
        <cylinderGeometry args={[0.035, 0.075, 0.9, 4]} />
      </mesh>
      <mesh geometry={geo.cone} material={k.steel} position={[0, 0, 1.06]} rotation={[Math.PI / 2, 0, 0]} scale={[0.09, 0.2, 0.045]} castShadow />
      <mesh geometry={geo.box} material={k.ironDark} position={[0, 0.024, 0.57]} scale={[0.018, 0.014, 0.7]} />
      {[-1, 1].map(side => <group key={side} position={[side * 0.11, 0, 0.09]} rotation={[0, side * -0.22, 0]}>
        <mesh geometry={geo.box} material={k.gold} scale={[0.23, 0.075, 0.07]} castShadow />
        <mesh geometry={geo.sphere} material={k.ironDark} position={[side * 0.105, 0, 0]} scale={[0.08, 0.09, 0.09]} />
      </group>)}
      <Handle z0={-0.2} z1={0.06} thick={0.075} mat={k.wrap} />
      <Grip k={k} z0={-0.18} z1={0.03} />
      <mesh geometry={geo.sphere} material={k.gold} position={[0, 0, -0.23]} scale={[0.12, 0.1, 0.12]} castShadow />
    </>
  );
}

/** Raised leather windings and metal collars follow the original hand socket. */
function Grip({ k, z0 = -0.08, z1 = 0.3 }: { k: Kit; z0?: number; z1?: number }) {
  return <>
    {Array.from({ length: 7 }, (_, i) => <Handle key={i} z0={z0 + (z1 - z0) * i / 7} z1={z0 + (z1 - z0) * i / 7 + 0.015} thick={0.086} mat={i === 0 || i === 6 ? k.gold : k.woodDark} />)}
  </>;
}

function Axe({ k, iron }: { k: Kit; iron: boolean }) {
  const head = iron ? k.steel : k.stone;
  const edge = iron ? k.gold : k.steel;
  return (
    <>
      <Handle z0={-0.12} z1={0.92} thick={0.07} mat={k.wood} />
      <Grip k={k} />
      <Handle z0={0.67} z1={0.94} thick={0.1} mat={k.ironDark} />
      {/* Cabeça: corpo + gume largo à frente, no plano do golpe */}
      <mesh geometry={geo.box} material={head} position={[0, 0.08, 0.8]} scale={[0.07, 0.3, 0.2]} castShadow />
      <mesh geometry={geo.box} material={edge} position={[0, 0.2, 0.88]} scale={[0.04, 0.34, 0.07]} castShadow />
      <mesh geometry={geo.box} material={k.ironDark} position={[0, -0.1, 0.8]} scale={[0.09, 0.1, 0.1]} />
      {[-1, 1].map(side => <mesh key={side} geometry={geo.sphere} material={k.gold} position={[side * 0.047, 0.07, 0.8]} scale={[0.026, 0.07, 0.07]} />)}
      {iron && <mesh geometry={geo.box} material={k.gold} position={[0, 0, 0.62]} scale={[0.09, 0.09, 0.05]} />}
    </>
  );
}

function Pickaxe({ k, iron }: { k: Kit; iron: boolean }) {
  const head = iron ? k.steel : k.stone;
  return (
    <>
      <Handle z0={-0.12} z1={0.95} thick={0.07} mat={k.wood} />
      <Grip k={k} />
      <Handle z0={0.72} z1={0.96} thick={0.105} mat={k.ironDark} />
      <mesh geometry={geo.box} material={head} position={[0, 0, 0.88]} scale={[0.09, 0.84, 0.09]} castShadow />
      <mesh geometry={geo.cone} material={head} position={[0, 0.55, 0.88]} scale={[0.09, 0.26, 0.09]} castShadow />
      <mesh geometry={geo.cone} material={head} position={[0, -0.55, 0.88]} rotation={[Math.PI, 0, 0]} scale={[0.09, 0.26, 0.09]} castShadow />
      <mesh geometry={geo.box} material={iron ? k.gold : k.ironDark} position={[0, 0, 0.88]} scale={[0.13, 0.13, 0.13]} />
    </>
  );
}

function Torch({ k }: { k: Kit }) {
  const flame = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const f = flame.current;
    if (f) {
      const p = 1 + Math.sin(t * 17) * 0.12 + Math.sin(t * 29) * 0.06;
      f.scale.set(p, 1 + Math.sin(t * 13) * 0.2, p);
      f.rotation.y = t * 2;
    }
    // Tremeluzir: a tocha realmente ilumina o raio ao redor do jogador.
    const l = light.current;
    if (l) {
      const inten = 7.8 + Math.sin(t * 17) * 1.1 + Math.sin(t * 29) * 0.5;
      // Zona Sul (pool de luzes): a tocha pede vaga no pool (equipar/guardar não muda a contagem de luzes → sem travada)
      l.getWorldPosition(tmpTorchV);
      if (requestLight(tmpTorchV.x, tmpTorchV.y, tmpTorchV.z, l.color, inten, l.distance, l.decay)) l.visible = false;
      else { l.visible = true; l.intensity = inten; }
    }
  });
  return (
    <>
      <Handle z0={-0.1} z1={0.7} thick={0.08} mat={k.wood} />
      <Grip k={k} />
      {[-1, 1].map(side => <mesh key={side} geometry={geo.box} material={k.ironDark} position={[side * 0.065, 0, 0.73]} rotation={[0, side * 0.18, 0]} scale={[0.025, 0.13, 0.26]} castShadow />)}
      <mesh geometry={geo.cyl} material={k.char} position={[0, 0, 0.74]} rotation={[Math.PI / 2, 0, 0]} scale={[0.15, 0.2, 0.15]} castShadow />
      <mesh geometry={geo.box} material={k.wrap} position={[0, 0, 0.5]} scale={[0.11, 0.11, 0.07]} />
      <group ref={flame} position={[0, 0.12, 0.76]}>
        <mesh geometry={geo.cone} material={k.flame} position={[0, 0.17, 0]} scale={[0.26, 0.5, 0.26]} />
        <mesh geometry={geo.cone} material={k.flameCore} position={[0.02, 0.1, 0.01]} scale={[0.14, 0.28, 0.14]} />
        <pointLight ref={light} color={k.flame.color} intensity={6.5} distance={20} decay={1.6} />
      </group>
    </>
  );
}

function Fist({ k }: { k: Kit }) {
  return (
    <>
      <mesh geometry={geo.box} material={k.glove} position={[0, 0, 0.1]} scale={[0.16, 0.16, 0.18]} castShadow />
      <mesh geometry={geo.box} material={k.ironDark} position={[0, 0, 0.2]} scale={[0.17, 0.12, 0.05]} />
      {[-0.055, 0, 0.055].map(x => <mesh key={x} geometry={geo.sphere} material={k.steel} position={[x, 0.025, 0.227]} scale={[0.04, 0.045, 0.025]} />)}
    </>
  );
}

/** Modelo certo para o item selecionado, dentro do grupo de golpe. */
function Bow({ k }: { k: Kit }) {
  return (
    <>
      <mesh geometry={geo.box} material={k.wood} position={[0, 0.26, 0.1]} rotation={[0, 0, 0.42]} scale={[0.04, 0.5, 0.06]} castShadow />
      <mesh geometry={geo.box} material={k.wood} position={[0, -0.26, 0.1]} rotation={[0, 0, -0.42]} scale={[0.04, 0.5, 0.06]} castShadow />
      <mesh geometry={geo.box} material={k.ironDark} position={[0, 0, 0.1]} scale={[0.05, 0.24, 0.07]} />
      <mesh geometry={geo.box} material={k.steel} position={[0.12, 0, 0.1]} scale={[0.008, 0.92, 0.008]} />
      {[-1, 1].map(side => <group key={side}>
        <mesh geometry={geo.box} material={k.gold} position={[side * -0.07, side * 0.18, 0.1]} rotation={[0, 0, side * 0.42]} scale={[0.055, 0.075, 0.075]} />
        <mesh geometry={geo.cone} material={k.ironDark} position={[side * -0.09, side * 0.48, 0.1]} rotation={[0, 0, side > 0 ? -0.6 : Math.PI + 0.6]} scale={[0.045, 0.14, 0.045]} castShadow />
      </group>)}
      {[-0.07, -0.035, 0, 0.035, 0.07].map(y => <mesh key={y} geometry={geo.box} material={k.wrap} position={[0, y, 0.1]} scale={[0.065, 0.016, 0.078]} />)}
    </>
  );
}

function Pistol({ k }: { k: Kit }) {
  return (
    <>
      <mesh geometry={geo.box} material={k.ironDark} position={[0, 0.02, 0.22]} scale={[0.06, 0.09, 0.34]} castShadow />
      <mesh geometry={geo.box} material={k.steel} position={[0, 0.08, 0.3]} scale={[0.02, 0.04, 0.05]} />
      <mesh geometry={geo.box} material={k.wood} position={[0, -0.1, 0.06]} rotation={[0.35, 0, 0]} scale={[0.06, 0.2, 0.09]} castShadow />
      <group position={[0, 0.025, 0]}><Handle z0={0.16} z1={0.43} thick={0.065} mat={k.steel} /></group>
      <mesh position={[0, 0.025, 0.432]} material={k.ironDark}><torusGeometry args={[0.024, 0.009, 6, 12]} /></mesh>
      <mesh position={[0, -0.055, 0.13]} rotation={[0, Math.PI / 2, 0]} material={k.gold}><torusGeometry args={[0.041, 0.007, 5, 10]} /></mesh>
      <mesh geometry={geo.box} material={k.gold} position={[0, -0.015, 0.055]} scale={[0.074, 0.03, 0.08]} />
    </>
  );
}

function Rifle({ k }: { k: Kit }) {
  return (
    <>
      <mesh geometry={geo.box} material={k.ironDark} position={[0, 0.02, 0.46]} scale={[0.05, 0.07, 0.82]} castShadow />
      <mesh geometry={geo.box} material={k.steel} position={[0, 0, 0.12]} scale={[0.06, 0.1, 0.34]} />
      <mesh geometry={geo.box} material={k.wood} position={[0, -0.04, -0.14]} scale={[0.06, 0.13, 0.3]} castShadow />
      <mesh geometry={geo.box} material={k.wood} position={[0, -0.12, 0.08]} rotation={[0.3, 0, 0]} scale={[0.05, 0.16, 0.08]} />
      <group position={[0, 0.02, 0]}><Handle z0={0.42} z1={0.89} thick={0.062} mat={k.steel} /></group>
      <mesh position={[0, 0.02, 0.895]} material={k.ironDark}><torusGeometry args={[0.023, 0.009, 6, 12]} /></mesh>
      <mesh geometry={geo.box} material={k.wood} position={[0, -0.012, 0.38]} scale={[0.075, 0.08, 0.24]} castShadow />
      {[0.27, 0.47].map(z => <mesh key={z} geometry={geo.box} material={k.gold} position={[0, 0, z]} scale={[0.08, 0.085, 0.027]} />)}
      <group position={[0, 0.105, 0]}><Handle z0={0.16} z1={0.38} thick={0.067} mat={k.ironDark} /></group>
      <mesh position={[0, -0.065, 0.15]} rotation={[0, Math.PI / 2, 0]} material={k.gold}><torusGeometry args={[0.042, 0.007, 5, 10]} /></mesh>
    </>
  );
}

/** `itemId` definido = arma de OUTRO jogador (online); sem ele, a do jogador local. */
export function HeldItem({ c, itemId }: { c: Palette; itemId?: string | null }) {
  const localKind = useGameStore(s => heldKindFor(selectedItemId(s)));
  const kind = itemId === undefined ? localKind : heldKindFor(itemId);
  const k = kitFor(c);
  switch (kind) {
    case 'sword': return <Sword k={k} />;
    case 'axe': return <Axe k={k} iron={false} />;
    case 'iron_axe': return <Axe k={k} iron />;
    case 'pickaxe': return <Pickaxe k={k} iron={false} />;
    case 'iron_pickaxe': return <Pickaxe k={k} iron />;
    case 'torch': return <Torch k={k} />;
    case 'bow': return <Bow k={k} />;
    // GLB (Pedro, 22/10) na mesma pega; a arma desenhada fica de reserva enquanto carrega.
    case 'pistol': return <Suspense fallback={<Pistol k={k} />}><PistolModel /></Suspense>;
    case 'rifle': return <Suspense fallback={<Rifle k={k} />}><RifleModel /></Suspense>;
    default: return <Fist k={k} />;
  }
}
