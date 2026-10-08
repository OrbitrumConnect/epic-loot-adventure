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
import { useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/game/state/game-store';
import { mixColor, type Palette } from './world-kit';

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
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  cone: new THREE.ConeGeometry(0.5, 1, 5),
  sphere: new THREE.SphereGeometry(0.5, 6, 5),
};

type Kit = Record<
  'wood' | 'woodDark' | 'steel' | 'ironDark' | 'stone' | 'gold' | 'wrap' | 'glove' | 'flame' | 'flameCore' | 'char',
  THREE.MeshStandardMaterial
>;
const kits = new Map<string, Kit>();

function kitFor(c: Palette): Kit {
  const key = `${c.trunk}|${c.metal}|${c.gold}`;
  const hit = kits.get(key);
  if (hit) return hit;
  const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, flatShading: true, ...extra });
  const kit: Kit = {
    wood: std(c.trunk),
    woodDark: std(mixColor(c.trunk, c.dark, 0.4)),
    steel: std(c.metal),
    ironDark: std(mixColor(c.metal, c.dark, 0.45)),
    stone: std(c['rock-light']),
    gold: std(c.gold),
    wrap: std(c.cloak),
    glove: std(c.armor),
    flame: std('#ff7a22', { emissive: new THREE.Color('#ff5a00'), emissiveIntensity: 2.2 }),
    flameCore: std('#ffd36b', { emissive: new THREE.Color('#ffc233'), emissiveIntensity: 2.6 }),
    char: std('#2a2018'),
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
  // Idêntico ao modelo original do jogo.
  return (
    <>
      <mesh geometry={geo.box} material={k.steel} position={[0, 0, 0.55]} scale={[0.08, 0.07, 1.1]} castShadow />
      <mesh geometry={geo.box} material={k.gold} position={[0, 0, 0.08]} scale={[0.34, 0.07, 0.07]} />
      <mesh geometry={geo.box} material={k.wood} position={[0, 0, -0.06]} scale={[0.06, 0.06, 0.16]} />
    </>
  );
}

function Axe({ k, iron }: { k: Kit; iron: boolean }) {
  const head = iron ? k.steel : k.stone;
  const edge = iron ? k.gold : k.steel;
  return (
    <>
      <Handle z0={-0.12} z1={0.92} thick={0.07} mat={k.wood} />
      {/* Cabeça: corpo + gume largo à frente, no plano do golpe */}
      <mesh geometry={geo.box} material={head} position={[0, 0.08, 0.8]} scale={[0.07, 0.3, 0.2]} castShadow />
      <mesh geometry={geo.box} material={edge} position={[0, 0.2, 0.88]} scale={[0.04, 0.34, 0.07]} castShadow />
      <mesh geometry={geo.box} material={k.ironDark} position={[0, -0.1, 0.8]} scale={[0.09, 0.1, 0.1]} />
      {iron && <mesh geometry={geo.box} material={k.gold} position={[0, 0, 0.62]} scale={[0.09, 0.09, 0.05]} />}
    </>
  );
}

function Pickaxe({ k, iron }: { k: Kit; iron: boolean }) {
  const head = iron ? k.steel : k.stone;
  return (
    <>
      <Handle z0={-0.12} z1={0.95} thick={0.07} mat={k.wood} />
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
    if (light.current) light.current.intensity = 6.5 + Math.sin(t * 17) * 1.1 + Math.sin(t * 29) * 0.5;
  });
  return (
    <>
      <Handle z0={-0.1} z1={0.7} thick={0.08} mat={k.wood} />
      <mesh geometry={geo.cyl} material={k.char} position={[0, 0, 0.74]} rotation={[Math.PI / 2, 0, 0]} scale={[0.15, 0.2, 0.15]} castShadow />
      <mesh geometry={geo.box} material={k.wrap} position={[0, 0, 0.5]} scale={[0.11, 0.11, 0.07]} />
      <group ref={flame} position={[0, 0.12, 0.76]}>
        <mesh geometry={geo.cone} material={k.flame} position={[0, 0.17, 0]} scale={[0.26, 0.5, 0.26]} />
        <mesh geometry={geo.cone} material={k.flameCore} position={[0.02, 0.1, 0.01]} scale={[0.14, 0.28, 0.14]} />
        <pointLight ref={light} color="#ff9a44" intensity={6.5} distance={16} decay={1.6} />
      </group>
    </>
  );
}

function Fist({ k }: { k: Kit }) {
  return (
    <>
      <mesh geometry={geo.box} material={k.glove} position={[0, 0, 0.1]} scale={[0.16, 0.16, 0.18]} castShadow />
      <mesh geometry={geo.box} material={k.ironDark} position={[0, 0, 0.2]} scale={[0.17, 0.12, 0.05]} />
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
    </>
  );
}

function Pistol({ k }: { k: Kit }) {
  return (
    <>
      <mesh geometry={geo.box} material={k.ironDark} position={[0, 0.02, 0.22]} scale={[0.06, 0.09, 0.34]} castShadow />
      <mesh geometry={geo.box} material={k.steel} position={[0, 0.08, 0.3]} scale={[0.02, 0.04, 0.05]} />
      <mesh geometry={geo.box} material={k.wood} position={[0, -0.1, 0.06]} rotation={[0.35, 0, 0]} scale={[0.06, 0.2, 0.09]} castShadow />
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
    </>
  );
}

export function HeldItem({ c }: { c: Palette }) {
  const kind = useGameStore(s => heldKindFor(selectedItemId(s)));
  const k = kitFor(c);
  switch (kind) {
    case 'sword': return <Sword k={k} />;
    case 'axe': return <Axe k={k} iron={false} />;
    case 'iron_axe': return <Axe k={k} iron />;
    case 'pickaxe': return <Pickaxe k={k} iron={false} />;
    case 'iron_pickaxe': return <Pickaxe k={k} iron />;
    case 'torch': return <Torch k={k} />;
    case 'bow': return <Bow k={k} />;
    case 'pistol': return <Pistol k={k} />;
    case 'rifle': return <Rifle k={k} />;
    default: return <Fist k={k} />;
  }
}
