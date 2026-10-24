import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { FACTORY_SHOWN, mixColor, rand, terrainHeight, type Palette } from './world-kit';

/**
 * Entulho/pedras na BEIRADA de cada fábrica: cobre a emenda entre o pad plano e
 * o terreno (o chão reto do GLB não casa 100% com o nosso). Tudo num ÚNICO
 * InstancedMesh (1 draw call, leve). Aditivo, só cenário.
 */
const ROCKS_PER = 16;

export function FactoryRubble({ c }: { c: Palette }) {
  const total = FACTORY_SHOWN.length * ROCKS_PER;
  const geo = useMemo(() => new THREE.DodecahedronGeometry(0.5, 0), []);
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: mixColor(c.rock, c.ground, 0.45), roughness: 1, flatShading: true }),
    [c],
  );
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const d = new THREE.Object3D();
    let i = 0;
    for (let s = 0; s < FACTORY_SHOWN.length; s++) {
      const f = FACTORY_SHOWN[s]!;
      for (let k = 0; k < ROCKS_PER; k++) {
        const seed = s * 97 + k * 7 + 3;
        const a = rand(seed) * Math.PI * 2;
        const rr = 5 + rand(seed + 1) * 6.5; // perto da base do prédio (cobre a emenda do chão)
        const x = f.x + Math.cos(a) * rr;
        const z = f.z + Math.sin(a) * rr;
        const sc = 0.5 + rand(seed + 2) * 1.4;
        d.position.set(x, terrainHeight(x, z) + sc * 0.12, z);
        d.rotation.set(rand(seed + 3) * 3, rand(seed + 4) * 6, rand(seed + 5) * 3);
        d.scale.set(sc, sc * (0.55 + rand(seed + 6) * 0.5), sc);
        d.updateMatrix();
        mesh.setMatrixAt(i++, d.matrix);
      }
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  return <instancedMesh ref={ref} args={[geo, mat, total]} castShadow receiveShadow frustumCulled={false} />;
}
