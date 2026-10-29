/**
 * ZONA SUL — água (mar + Lagoa no mesmo nível, 0 m), levemente transparente (a areia rasa aparece perto da praia), com
 * ondulação suave perto da câmera. MAR EM DISCO (Pedro: "pra que isso tudo de água? reduz mais da metade"): cobre o
 * mapa inteiro e some na névoa logo depois — antes era um plano até o horizonte. O fundo do mar acompanha o disco.
 */
import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { type ZsTerrain, ZS_WATER_Y } from './zs-terrain-data';
import { surfZone } from './surf/surf-break';
import { SURF } from './surf/surf-wave';
import { ZS_RIPPLE_GLSL, ZS_WATER_LOOK, zsWaterTime } from './zs-water-look';

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
  const time = zsWaterTime;
  const { r0, r1 } = useMemo(() => zsSeaRadius(t), [t]);
  const water = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ ...ZS_WATER_LOOK, transparent: true, depthWrite: false });
    m.onBeforeCompile = (s) => {
      s.uniforms['uTime'] = time;
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec2 vWaveXZ;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWaveXZ = (modelMatrix * vec4(position, 1.0)).xz;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec2 vWaveXZ;')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>' + ZS_RIPPLE_GLSL);
    };
    // dentro da zona de surf quem desenha a água é a malha da onda (sem duas águas uma em cima da outra)
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
      prev.call(m, sh, r);
      sh.uniforms['uSurf'] = surfU.uSurf; sh.uniforms['uSurfQ'] = surfU.uSurfQ; sh.uniforms['uSurfL'] = surfU.uSurfL;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec4 uSurf;\nuniform vec4 uSurfQ;\nuniform float uSurfL;')
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  if (uSurfQ.w > 0.5) { vec2 d = vWaveXZ - uSurf.xy; float qq = dot(d, uSurf.zw), ss = dot(d, vec2(-uSurf.w, uSurf.z));
    if (ss < uSurfQ.x && ss > -uSurfL && qq > uSurfQ.y && qq < uSurfQ.z) discard; }`);
    };
    return withSeaFade(m, r0, r1, 'zs-water-v4');
  }, [time, r0, r1]);
  const floor = useMemo(() => withSeaFade(new THREE.MeshStandardMaterial({ color: '#2d5a66', roughness: 1, depthWrite: true }), r0, r1, 'zs-seafloor-v1'), [r0, r1]);
  // borda da malha da onda: cada lado com o seu limite (direita = pedra, esquerda = Leblon, mar aberto)
  const surfU = useMemo(() => ({ uSurf: { value: new THREE.Vector4() }, uSurfQ: { value: new THREE.Vector4() }, uSurfL: { value: 0 } }), []);
  useFrame((_, dt) => {
    time.value += dt;
    const f = surfZone.frame;
    // 5 cm pra dentro da borda da malha da onda: com 0,5 m as duas águas transparentes se sobrepunham (linha escura);
    // com 0 sobrava fresta de pixel (linha pontilhada)
    if (surfZone.on && surfZone.drawn && f) { surfU.uSurf.value.set(f.px, f.pz, f.qx, f.qz); surfU.uSurfQ.value.set(f.lim[0] - 0.05, SURF.Q_MIN + 0.05, SURF.Q_MAX - 0.05, 1); surfU.uSurfL.value = f.lim[1] - 0.05; }
    else surfU.uSurfQ.value.w = 0;
  });
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
