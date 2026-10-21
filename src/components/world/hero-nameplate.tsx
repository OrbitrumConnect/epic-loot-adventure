/**
 * Plaquinha do HERÓI local (nick · Nv. X + barra de vida) flutuando acima da cabeça — igual à
 * dos inimigos (`enemy-label`) e dos jogadores remotos (`remote-players`). Regrediu em algum
 * sync; reposta aqui reusando o MESMO desenho (billboard pro câmera + barra de HP que encolhe).
 *
 * Fica dentro do grupo do corpo do herói (segue o personagem). Lê nome/nível/vida da store; o
 * nome/nível só reconstroem a textura quando mudam (useMemo), e a barra de HP atualiza por quadro.
 */
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/game/state/game-store';
import { labelTexture, HERO_HEIGHT } from './world-kit';

const noRaycast = () => {};

export function HeroNameplate() {
  const labelGroup = useRef<THREE.Group>(null);
  const hpFill = useRef<THREE.Mesh>(null);
  const name = useGameStore((s) => s.player.name);
  const level = useGameStore((s) => s.player.level);
  const title = `${name} · Nv. ${level}`;
  const texture = useMemo(() => labelTexture(title, '#bfe4ff'), [title]);

  useFrame((state) => {
    const g = labelGroup.current;
    if (g) g.quaternion.copy(state.camera.quaternion); // sempre de frente pra câmera
    if (hpFill.current) {
      const p = useGameStore.getState().player;
      const ratio = Math.max(0, Math.min(1, p.hp / Math.max(1, p.maxHp)));
      hpFill.current.scale.x = ratio;
      hpFill.current.position.x = -0.45 + ratio * 0.45; // ancorado à esquerda (encolhe pra direita)
    }
  });

  return (
    <group ref={labelGroup} position={[0, HERO_HEIGHT + 0.65, 0]}>
      <mesh position={[0, 0.2, 0]} renderOrder={12} raycast={noRaycast}>
        <planeGeometry args={[0.2 * texture.aspect, 0.2]} />
        <meshBasicMaterial map={texture.texture} transparent depthTest={false} depthWrite={false} />
      </mesh>
      <mesh renderOrder={10} raycast={noRaycast}>
        <planeGeometry args={[0.94, 0.14]} />
        <meshBasicMaterial color="#101d19" transparent opacity={0.86} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh ref={hpFill} position={[0, 0, 0.002]} renderOrder={11} raycast={noRaycast}>
        <planeGeometry args={[0.9, 0.1]} />
        <meshBasicMaterial color="#55c979" transparent depthTest={false} depthWrite={false} />
      </mesh>
    </group>
  );
}
