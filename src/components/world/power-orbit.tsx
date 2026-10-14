import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/game/state/game-store';
import { cellCenter } from '@/game/systems/playerBaseSystem';
import { boomerangPositions, orbitCount, ORBIT_Y } from '@/game/systems/powerSystem';
import { terrainHeight } from './world-kit';

/**
 * BUMERANGUES orbitais (power da carta `orbit_boomerang`) — lâminas que giram em
 * volta do núcleo da base e cortam a horda. O render SÓ posiciona/anima; o dano
 * é aplicado por `tickPowers` no store (puro/throttled). Agenda o tick a cada
 * frame, igual o `TowerRuntime`. Limite fixo de lâminas = sem realocar malha.
 */
const MAX_BLADES = 8;

export function PowerOrbit({ paused }: { paused: boolean }) {
  const refs = useRef<(THREE.Group | null)[]>([]);
  useFrame(() => {
    if (paused) return;
    const state = useGameStore.getState();
    const now = Date.now();
    state.tickPowers(now);

    const stacks = state.baseUpgrades.orbit_boomerang;
    const core = state.playerBase?.pieces.find((p) => p.kind === 'core');
    const count = core && stacks > 0 ? orbitCount(stacks) : 0;
    const positions = count > 0 && core ? boomerangPositions(cellCenter(core.cell), count, now) : [];
    for (let i = 0; i < MAX_BLADES; i++) {
      const g = refs.current[i];
      if (!g) continue;
      if (i < positions.length) {
        const p = positions[i]!;
        g.visible = true;
        g.position.set(p.x, terrainHeight(p.x, p.z) + ORBIT_Y, p.z);
        g.rotation.y += 0.6; // a própria lâmina gira (brilho/leitura)
      } else {
        g.visible = false;
      }
    }
  });

  return (
    <group>
      {Array.from({ length: MAX_BLADES }, (_, i) => (
        <group key={i} ref={(el) => { refs.current[i] = el; }} visible={false}>
          <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
            {/* torus de 3 segmentos = lâmina triangular (barato) */}
            <torusGeometry args={[0.55, 0.14, 6, 3]} />
            <meshStandardMaterial color="#67e8f9" emissive="#22d3ee" emissiveIntensity={0.7} metalness={0.3} roughness={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
