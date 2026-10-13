import { DoubleSide } from 'three';
import { useGameStore } from '@/game/state/game-store';
import { cellCenter } from '@/game/systems/playerBaseSystem';
import { terrainHeight } from './world-kit';

/**
 * Salão da Tribo (tenda/tepee) — espelha o asset Lv1 do Clash no open world 3D.
 * Procedural, self-textured (sem branco), leve, escalável por nível. ADITIVO:
 * renderizado no centro (core) da base sem tocar nas peças/claim/Clash existentes.
 */
export function TribalHall({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  const cloth = '#c6a375';
  const clothTrim = '#9a7a52';
  const wood = '#4a3a2a';
  return (
    <group position={position} scale={scale}>
      {/* Lona cônica (tepee) */}
      <mesh position={[0, 1.45, 0]} castShadow receiveShadow>
        <coneGeometry args={[1.7, 2.9, 12, 1, true]} />
        <meshStandardMaterial color={cloth} roughness={0.96} side={DoubleSide} />
      </mesh>
      {/* Faixa decorativa na base da lona */}
      <mesh position={[0, 0.34, 0]} castShadow>
        <cylinderGeometry args={[1.62, 1.7, 0.42, 12, 1, true]} />
        <meshStandardMaterial color={clothTrim} roughness={0.95} side={DoubleSide} />
      </mesh>
      {/* Abertura/porta escura na frente */}
      <mesh position={[0, 0.72, 1.5]} rotation={[0.16, 0, 0]}>
        <coneGeometry args={[0.5, 1.4, 3, 1, true]} />
        <meshStandardMaterial color="#241a12" side={DoubleSide} />
      </mesh>
      {/* Varas cruzando e saindo pelo topo (característico do tepee) */}
      {[-1, 1].map((s) => (
        <mesh key={`x${s}`} position={[s * 0.2, 2.25, 0]} rotation={[0, 0, s * 0.11]} castShadow>
          <cylinderGeometry args={[0.035, 0.05, 2.7, 6]} />
          <meshStandardMaterial color={wood} roughness={0.9} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={`z${s}`} position={[0, 2.25, s * 0.2]} rotation={[s * 0.11, 0, 0]} castShadow>
          <cylinderGeometry args={[0.035, 0.05, 2.7, 6]} />
          <meshStandardMaterial color={wood} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/** Lê o core da base e desenha o Salão da Tribo ali. Aditivo, reativo ao estado. */
export function BaseTribalHall() {
  const pieces = useGameStore((s) => s.playerBase?.pieces);
  const core = pieces?.find((p) => p.kind === 'core');
  if (!core) return null;
  const ctr = cellCenter(core.cell);
  return <TribalHall position={[ctr.x, terrainHeight(ctr.x, ctr.z), ctr.z]} />;
}
