/**
 * ZONA SUL — água (mar + Lagoa no mesmo nível, 0 m), levemente transparente (a areia rasa aparece perto da praia), com
 * ondulação suave perto da câmera. MAR EM DISCO (Pedro: "pra que isso tudo de água? reduz mais da metade"): cobre o
 * mapa inteiro e some na névoa logo depois — antes era um plano até o horizonte. O fundo do mar acompanha o disco.
 */
import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { type ZsTerrain, ZS_WATER_Y } from './zs-terrain-data';

/** Raio onde o mar começa a sumir e onde some de vez (m), a partir do centro do mapa. */
export function zsSeaRadius(t: ZsTerrain): { r0: number; r1: number } {
  const half = Math.hypot(t.w * t.cell, t.h * t.cell) / 2; // cobre até os cantos do mapa
  return { r0: half + 20, r1: half + 260 };
}

/** Some o material com a distância ao centro (alfa). */
function withSeaFade(m: THREE.MeshStandardMaterial, r0: number, r1: number, key: string) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (s, r) => {
    prev?.call(m, s, r);
    s.uniforms['uSeaR0'] = { value: r0 }; s.uniforms['uSeaR1'] = { value: r1 };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSeaXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSeaXZ = (modelMatrix * vec4(position, 1.0)).xz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSeaXZ;\nuniform float uSeaR0;\nuniform float uSeaR1;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.a *= 1.0 - smoothstep(uSeaR0, uSeaR1, length(vSeaXZ));');
  };
  m.transparent = true;
  m.customProgramCacheKey = () => key;
  return m;
}

export function ZsWater({ t }: { t: ZsTerrain }) {
  const time = useMemo(() => ({ value: 0 }), []);
  const { r0, r1 } = useMemo(() => zsSeaRadius(t), [t]);
  const water = useMemo(() => {
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
    return withSeaFade(m, r0, r1, 'zs-water-v3');
  }, [time, r0, r1]);
  const floor = useMemo(() => withSeaFade(new THREE.MeshStandardMaterial({ color: '#2d5a66', roughness: 1, depthWrite: true }), r0, r1, 'zs-seafloor-v1'), [r0, r1]);
  useFrame((_, dt) => { time.value += dt; });
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, ZS_WATER_Y, 0]} material={water} renderOrder={2}>
        <circleGeometry args={[r1, 96]} />
      </mesh>
      {/* fundo do mar além da borda do mapa (sem ele a água "clareava" onde não há terreno embaixo) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -12.5, 0]} material={floor}>
        <circleGeometry args={[r1, 96]} />
      </mesh>
    </>
  );
}
