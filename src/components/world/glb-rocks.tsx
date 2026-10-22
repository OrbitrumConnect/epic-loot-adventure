import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/game/state/game-store';
import { terrainHeight } from './world-kit';
import { glbSurfaceY } from './terrain-collision';

/**
 * Pedra farmável BONITA como GLB (Meshy, decimado 75k tris) sobre os nós de
 * colheita `rock`. Mesmo padrão do GlbCrystals: POOL fixo nos mais próximos do
 * player; os distantes ficam no procedural barato. `raycast` OFF → o clique vai
 * pro nó procedural atrás (mineração intacta).
 */
const URL = '/models/rocks/mining-rock.glb';
const TARGET_H = 1.7;
const POOL = 6;

function noRaycast() {}

export function GlbRocks() {
  const { scene } = useGLTF(URL);

  const proto = useMemo(() => {
    const o = scene.clone(true);
    o.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; mesh.raycast = noRaycast; }
    });
    const box = new THREE.Box3().setFromObject(o);
    const h = box.max.y - box.min.y || 1;
    o.scale.setScalar(TARGET_H / h);
    const b2 = new THREE.Box3().setFromObject(o);
    o.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
    const wrap = new THREE.Group();
    wrap.add(o);
    return wrap;
  }, [scene]);

  const slots = useMemo(() => Array.from({ length: POOL }, () => proto.clone(true)), [proto]);
  const refs = useRef<(THREE.Group | null)[]>([]);
  const acc = useRef(0);

  useFrame((_s, delta) => {
    acc.current += delta;
    if (acc.current < 0.2) return; // pedras não se movem → ~5Hz basta
    acc.current = 0;
    const st = useGameStore.getState();
    const p = st.player.position;
    const live = st.harvestNodes.filter((n) => n.kind === 'rock' && !n.depleted);
    live.sort((a, b) =>
      ((a.position.x - p.x) ** 2 + (a.position.z - p.z) ** 2) -
      ((b.position.x - p.x) ** 2 + (b.position.z - p.z) ** 2),
    );
    for (let i = 0; i < POOL; i++) {
      const g = refs.current[i];
      if (!g) continue;
      const n = live[i];
      if (n) {
        g.visible = true;
        g.position.set(n.position.x, glbSurfaceY(n.position.x, n.position.z, terrainHeight(n.position.x, n.position.z)), n.position.z);
        g.rotation.y = (n.seed % 360) * (Math.PI / 180);
      } else {
        g.visible = false;
      }
    }
  });

  return (
    <>
      {slots.map((s, i) => (
        <group key={i} ref={(el) => { refs.current[i] = el; }} visible={false}>
          <primitive object={s} />
        </group>
      ))}
    </>
  );
}

// Preload sob demanda: useGLTF carrega URL na montagem (Suspense + AssetBoundary).
