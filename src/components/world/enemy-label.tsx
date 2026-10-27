/**
 * Nome + barra de vida do inimigo, e o anel de seleção no chão.
 *
 * O nome é uma textura de canvas (cacheada por texto em `world-kit`), então
 * não depende de fonte baixada e custa uma `plane` por inimigo. O grupo recebe
 * a rotação da câmera no laço da IA, logo funciona nas duas câmeras.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { labelTexture, type Palette } from './world-kit';

const noRaycast = () => {};

export const GEO_HL = new THREE.PlaneGeometry(1.04, 0.2);
export const GEO_HP_BG = new THREE.PlaneGeometry(0.94, 0.14);
export const GEO_HP_FILL = new THREE.PlaneGeometry(0.9, 0.1);

const ringGeos = new Map<number, THREE.RingGeometry>();
const hlMats = new Map<string, THREE.MeshBasicMaterial>();
const hpBgMats = new Map<string, THREE.MeshBasicMaterial>();
const hpFillMats = new Map<string, THREE.MeshBasicMaterial>();
const ringMats = new Map<string, THREE.MeshBasicMaterial>();

function colorKey(cor: THREE.ColorRepresentation) {
  return new THREE.Color(cor).getHexString();
}

export function ringGeometry(radius: number) {
  const chave = Number(radius.toFixed(3));
  let geometria = ringGeos.get(chave);
  if (!geometria) {
    geometria = new THREE.RingGeometry(radius, radius + 0.12, 28, 1, 0, Math.PI * 1.7);
    ringGeos.set(chave, geometria);
  }
  return geometria;
}

export function matHl(cor: THREE.ColorRepresentation) {
  const chave = colorKey(cor);
  let material = hlMats.get(chave);
  if (!material) {
    material = new THREE.MeshBasicMaterial({ color: cor, transparent: true, depthTest: false, depthWrite: false });
    hlMats.set(chave, material);
  }
  return material;
}

export function matHpBg(cor: THREE.ColorRepresentation) {
  const chave = colorKey(cor);
  let material = hpBgMats.get(chave);
  if (!material) {
    material = new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false });
    hpBgMats.set(chave, material);
  }
  return material;
}

export function matHpFill(cor: THREE.ColorRepresentation = '#c8412f') {
  const chave = colorKey(cor);
  let material = hpFillMats.get(chave);
  if (!material) {
    material = new THREE.MeshBasicMaterial({ color: cor, transparent: true, depthTest: false, depthWrite: false });
    hpFillMats.set(chave, material);
  }
  return material;
}

export function matRing(cor: THREE.ColorRepresentation) {
  const chave = colorKey(cor);
  let material = ringMats.get(chave);
  if (!material) {
    material = new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    ringMats.set(chave, material);
  }
  return material;
}

export function EnemyLabel({
  name, height, hpGroup, label, hpFill, c,
}: {
  name: string;
  height: number;
  hpGroup: React.RefObject<THREE.Group | null>;
  label: React.RefObject<THREE.Group | null>;
  hpFill: React.RefObject<THREE.Mesh | null>;
  c: Palette;
}) {
  const tex = useMemo(() => labelTexture(name, c.light), [name, c.light]);

  return (
    <group ref={hpGroup} position={[0, height, 0]} visible={false}>
      <group ref={label}>
        {/* Moldura de destaque (alvo selecionado ou caçada do piloto) */}
        <mesh name="hl" visible={false} position={[0, 0, -0.003]} renderOrder={9} raycast={noRaycast} geometry={GEO_HL} material={matHl(c.gold)} />
        {/* Inline de propósito: textura única por nome; R3F descarta filhos JSX no desmonte. */}
        <mesh position={[0, 0.2, 0]} renderOrder={12} raycast={noRaycast}>
          <planeGeometry args={[0.2 * tex.aspect, 0.2]} />
          <meshBasicMaterial map={tex.texture} transparent depthTest={false} depthWrite={false} />
        </mesh>
        <mesh renderOrder={10} raycast={noRaycast} geometry={GEO_HP_BG} material={matHpBg(c.dark)} />
        <mesh ref={hpFill} position={[0, 0, 0.002]} renderOrder={11} raycast={noRaycast} geometry={GEO_HP_FILL} material={matHpFill()} />
      </group>
    </group>
  );
}

export function SelectionRing({
  ring, radius = 0.6, c,
}: {
  ring: React.RefObject<THREE.Object3D | null>;
  radius?: number;
  c: Palette;
}) {
  return (
    <mesh
      ref={ring as React.RefObject<THREE.Mesh>}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.05, 0]}
      visible={false}
      raycast={noRaycast}
      geometry={ringGeometry(radius)}
      material={matRing(c.gold)}
    />
  );
}
