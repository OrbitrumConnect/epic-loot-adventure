import { useFrame } from '@react-three/fiber';
import { Suspense, useRef } from 'react';
import { BoomerangModel, HurricaneModel } from './fx-models';
import * as THREE from 'three';
import { useGameStore } from '@/game/state/game-store';
import {
  BOOMERANG_BLADES, BOOMERANG_DURATION_MS, LIGHTNING_BOLT_MS, TORNADO_COUNT, TORNADO_DURATION_MS,
  heroBoomerangPositions, heroTornadoPositions,
} from '@/game/systems/heroPowersSystem';
import { glbSurfaceY } from './terrain-collision';
import { terrainHeight } from './world-kit';

/**
 * Render dos PODERES DO HERÓI (o dano/empurrão é do store: `tickHeroPowers`, throttled; aqui
 * só agenda o tick e anima). Tamanho do HERÓI, não gigante como os da base.
 *  - Bumerangue: 3 bumerangues (GLB Mad Max) girando em espiral em volta do herói.
 *  - Furacão: 2 furacões (GLB, semi-transparentes) viajando em zigue-zague até ~12 m.
 *  - Raio: clarões verticais nos alvos atingidos.
 * Malhas fixas (sem realocar).
 */
const MAX_BOLTS = 8;

export function HeroPowers({ playerRef, paused }: { playerRef: React.RefObject<THREE.Group | null>; paused: boolean }) {
  const blades = useRef<(THREE.Group | null)[]>([]);
  const tornados = useRef<(THREE.Group | null)[]>([]);
  const bolts = useRef<(THREE.Mesh | null)[]>([]);

  useFrame(() => {
    const st = useGameStore.getState();
    const now = Date.now();
    if (!paused) st.tickHeroPowers(now);
    const hp = st.heroPowers;
    const p = playerRef.current?.position;

    // Bumerangues
    const boom = !!p && now < hp.boomerangUntil;
    const pos = boom && p ? heroBoomerangPositions({ x: p.x, z: p.z }, (now - hp.boomerangStart) / BOOMERANG_DURATION_MS, now) : [];
    for (let i = 0; i < BOOMERANG_BLADES; i++) {
      const g = blades.current[i];
      if (!g) continue;
      const b = pos[i];
      g.visible = !!b;
      if (b && p) {
        g.position.set(b.x, p.y + 1.1, b.z);
        g.rotation.y = now / 70; // gira no próprio eixo
      }
    }

    // Furacão: 2 tornados viajando em zigue-zague quase reto
    const tornOn = now < hp.tornadoUntil;
    const tw = tornOn ? heroTornadoPositions(hp.tornadoOrigin, hp.tornadoDir, (now - hp.tornadoStart) / TORNADO_DURATION_MS) : [];
    for (let i = 0; i < TORNADO_COUNT; i++) {
      const g = tornados.current[i];
      if (!g) continue;
      const q = tw[i];
      g.visible = !!q;
      if (q) {
        g.position.set(q.x, glbSurfaceY(q.x, q.z, terrainHeight(q.x, q.z)), q.z);
        g.rotation.y = now / 90;
      }
    }

    // Raio
    for (let i = 0; i < MAX_BOLTS; i++) {
      const m = bolts.current[i];
      if (!m) continue;
      const b = hp.bolts[hp.bolts.length - 1 - i];
      const age = b ? now - b.at : Infinity;
      m.visible = age < LIGHTNING_BOLT_MS;
      if (b && m.visible) {
        m.position.set(b.x, glbSurfaceY(b.x, b.z, terrainHeight(b.x, b.z)) + 7, b.z);
        (m.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - age / LIGHTNING_BOLT_MS);
      }
    }
  });

  return (
    <>
      {Array.from({ length: BOOMERANG_BLADES }, (_, i) => (
        <group key={`hb-${i}`} ref={(el) => { blades.current[i] = el; }} visible={false}>
          {/* GLB do bumerangue Mad Max; o anel antigo fica de reserva enquanto carrega. */}
          <Suspense fallback={
            <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.32, 0.07, 6, 14, Math.PI * 1.3]} />
              <meshStandardMaterial color="#fde68a" emissive="#f59e0b" emissiveIntensity={0.8} metalness={0.4} roughness={0.35} />
            </mesh>
          }>
            <BoomerangModel />
          </Suspense>
        </group>
      ))}
      {Array.from({ length: TORNADO_COUNT }, (_, i) => (
        <group key={`ht-${i}`} ref={(el) => { tornados.current[i] = el; }} visible={false}>
          {/* GLB do furacão, semi-transparente; os cones antigos ficam de reserva. */}
          <Suspense fallback={<>
            <mesh position={[0, 1.8, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[1.5, 3.6, 12, 1, true]} />
              <meshStandardMaterial color="#cbd5e1" transparent opacity={0.4} emissive="#94a3b8" emissiveIntensity={0.3} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            <mesh position={[0, 0.8, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[0.7, 1.6, 10, 1, true]} />
              <meshStandardMaterial color="#e2e8f0" transparent opacity={0.55} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
          </>}>
            <HurricaneModel opacity={0.5} />
          </Suspense>
        </group>
      ))}
      {Array.from({ length: MAX_BOLTS }, (_, i) => (
        <mesh key={`bolt-${i}`} ref={(el) => { bolts.current[i] = el; }} visible={false}>
          <boxGeometry args={[0.18, 14, 0.18]} />
          <meshBasicMaterial color="#e0f2fe" transparent opacity={0.9} depthWrite={false} />
        </mesh>
      ))}
    </>
  );
}
