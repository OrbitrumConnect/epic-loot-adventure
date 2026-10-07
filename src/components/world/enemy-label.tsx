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
        <mesh position={[0, 0.2, 0]} renderOrder={12} raycast={noRaycast}>
          <planeGeometry args={[0.2 * tex.aspect, 0.2]} />
          <meshBasicMaterial map={tex.texture} transparent depthTest={false} depthWrite={false} />
        </mesh>
        <mesh renderOrder={10} raycast={noRaycast}>
          <planeGeometry args={[0.94, 0.14]} />
          <meshBasicMaterial color={c.dark} transparent opacity={0.85} depthTest={false} depthWrite={false} />
        </mesh>
        <mesh ref={hpFill} position={[0, 0, 0.002]} renderOrder={11} raycast={noRaycast}>
          <planeGeometry args={[0.9, 0.1]} />
          <meshBasicMaterial color="#c8412f" depthTest={false} depthWrite={false} />
        </mesh>
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
    >
      <ringGeometry args={[radius, radius + 0.12, 28, 1, 0, Math.PI * 1.7]} />
      <meshBasicMaterial color={c.gold} transparent opacity={0.85} side={THREE.DoubleSide} />
    </mesh>
  );
}
