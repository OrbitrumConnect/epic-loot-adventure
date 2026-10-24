import { useFrame } from '@react-three/fiber';
import { Suspense, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/game/state/game-store';
import { cellCenter } from '@/game/systems/playerBaseSystem';
import {
  boomerangPositions, orbitCount, ORBIT_Y,
  tornadoPositions, tornadoCount, TORNADO_Y,
} from '@/game/systems/powerSystem';
import { terrainHeight } from './world-kit';
import { BoomerangModel, HurricaneModel } from './fx-models';

/**
 * Render dos POWERS da base (o dano é do `tickPowers` no store, puro/throttled;
 * aqui só posiciona/anima). Agenda o tick a cada frame, igual o `TowerRuntime`.
 *  - BUMERANGUES (`orbit_boomerang`): lâminas que giram perto do muro.
 *  - TORNADOS (`tornado`): redemoinhos patrulhando o anel externo.
 *  Visual = os MESMOS GLB dos poderes do herói (fx-models), maiores; o low-poly fica só de reserva.
 * Limites fixos de malha = sem realocar. Ambos são powers temporários (gate por
 * onda). São cartas SEPARADAS — nunca entram juntos numa mesma escolha.
 */
const MAX_BLADES = 8;
const MAX_TORNADOES = 4;
/** Tamanho (m) dos GLB na base: herói usa 0,9 / 3,6 — a base é maior (acerto 2,2 m / 3,8 m). */
export const BASE_BOOMERANG_SIZE = 1.4;
export const BASE_TORNADO_SIZE = 5.4;

export function PowerOrbit({ paused }: { paused: boolean }) {
  const blades = useRef<(THREE.Group | null)[]>([]);
  const tornadoes = useRef<(THREE.Group | null)[]>([]);

  useFrame(() => {
    if (paused) return;
    const state = useGameStore.getState();
    const now = Date.now();
    state.tickPowers(now);

    const core = state.playerBase?.pieces.find((p) => p.kind === 'core');
    const center = core ? cellCenter(core.cell) : null;

    // Bumerangues
    const orb = state.baseUpgrades.orbit_boomerang;
    const orbActive = center && orb > 0 && state.wave.wave <= state.orbitExpiresWave;
    const bladePos = orbActive && center ? boomerangPositions(center, orbitCount(orb), now) : [];
    for (let i = 0; i < MAX_BLADES; i++) {
      const g = blades.current[i];
      if (!g) continue;
      if (i < bladePos.length) {
        const p = bladePos[i]!;
        g.visible = true;
        g.position.set(p.x, terrainHeight(p.x, p.z) + ORBIT_Y, p.z);
        g.rotation.y += 0.6;
      } else { g.visible = false; }
    }

    // Tornados
    const tor = state.baseUpgrades.tornado;
    const torActive = center && tor > 0 && state.wave.wave <= state.tornadoExpiresWave;
    const torPos = torActive && center ? tornadoPositions(center, tornadoCount(tor), now) : [];
    for (let i = 0; i < MAX_TORNADOES; i++) {
      const g = tornadoes.current[i];
      if (!g) continue;
      if (i < torPos.length) {
        const p = torPos[i]!;
        g.visible = true;
        g.position.set(p.x, terrainHeight(p.x, p.z) + TORNADO_Y, p.z);
        g.rotation.y += 0.9; // redemoinho gira rápido
      } else { g.visible = false; }
    }
  });

  return (
    <group>
      {Array.from({ length: MAX_BLADES }, (_, i) => (
        <group key={`b${i}`} ref={(el) => { blades.current[i] = el; }} visible={false}>
          {/* Mesmo GLB do bumerangue do herói, maior (Pedro, 24/10); a lâmina antiga fica de reserva enquanto carrega. */}
          <Suspense fallback={
            <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.55, 0.14, 6, 3]} />
              <meshStandardMaterial color="#67e8f9" emissive="#22d3ee" emissiveIntensity={0.7} metalness={0.3} roughness={0.4} />
            </mesh>
          }>
            <BoomerangModel size={BASE_BOOMERANG_SIZE} />
          </Suspense>
        </group>
      ))}
      {Array.from({ length: MAX_TORNADOES }, (_, i) => (
        <group key={`t${i}`} ref={(el) => { tornadoes.current[i] = el; }} visible={false}>
          {/* Mesmo GLB do furacão do herói, MAIOR e mesma opacidade (Pedro); os cones antigos ficam de reserva.
              Cone: ponta FINA embaixo (no chão), boca larga em cima (rotation X=π inverte o cone). */}
          <Suspense fallback={<>
            <mesh position={[0, 2.2, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[1.6, 4.4, 10, 1, true]} />
              <meshStandardMaterial color="#cbd5e1" transparent opacity={0.4} emissive="#94a3b8" emissiveIntensity={0.3} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            <mesh position={[0, 0.9, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[0.7, 1.8, 10, 1, true]} />
              <meshStandardMaterial color="#e2e8f0" transparent opacity={0.55} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
          </>}>
            <HurricaneModel opacity={0.5} size={BASE_TORNADO_SIZE} />
          </Suspense>
        </group>
      ))}
    </group>
  );
}
