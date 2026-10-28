/**
 * ZONA SUL — água (mar + Lagoa no mesmo nível, 0 m): um plano só, levemente transparente (a areia rasa aparece
 * perto da praia) com ondulação suave no shader. Segue o herói (sempre cobre a vista; custo de 1 plano).
 */
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ZS_WATER_Y } from './zs-terrain-data';

export function ZsWater({ heroRef }: { heroRef: React.MutableRefObject<THREE.Vector3> }) {
  const ref = useRef<THREE.Mesh>(null);
  const time = useMemo(() => ({ value: 0 }), []);
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: '#2b6f8f', transparent: true, opacity: 0.78, roughness: 0.18, metalness: 0.05, depthWrite: false });
    m.onBeforeCompile = (s) => {
      s.uniforms['uTime'] = time;
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec2 vWaveXZ;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWaveXZ = (modelMatrix * vec4(position, 1.0)).xz;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec2 vWaveXZ;')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  vec2 wq = vWaveXZ * 0.18;
  float w1 = sin(wq.x * 1.7 + uTime * 0.9) + sin(wq.y * 2.3 - uTime * 0.7);
  float w2 = sin((wq.x + wq.y) * 3.1 + uTime * 1.3);
  // some com a distância: longe a ondulação "tremia" em listras (vista de cima, 28/10)
  float wfade = clamp(1.0 - length(vViewPosition) / 180.0, 0.0, 1.0);
  normal = normalize(normal + wfade * vec3(cos(wq.x * 1.7 + uTime * 0.9) * 0.06 + w2 * 0.03, 0.0, cos(wq.y * 2.3 - uTime * 0.7) * 0.06 - w1 * 0.01));`);
    };
    m.customProgramCacheKey = () => 'zs-water-v2';
    return m;
  }, [time]);
  useFrame((_, dt) => {
    time.value += dt;
    if (ref.current) ref.current.position.set(Math.round(heroRef.current.x / 64) * 64, ZS_WATER_Y, Math.round(heroRef.current.z / 64) * 64);
  });
  return (
    <>
      <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} material={mat} renderOrder={2}>
        <planeGeometry args={[9000, 9000, 1, 1]} />
      </mesh>
      {/* fundo do mar além da borda do mapa (sem ele a água "clareava" onde não há terreno embaixo) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -12.5, 0]}>
        <planeGeometry args={[12000, 12000, 1, 1]} />
        <meshStandardMaterial color="#2d5a66" roughness={1} />
      </mesh>
    </>
  );
}
