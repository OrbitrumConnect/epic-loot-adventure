import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { zsCave } from './zs-context';
import { caveCheckpoints, zsChasm } from './zs-chasm';

/**
 * MARCOS DE CHECKPOINT (05/11, o parkour até o Canibal — regras em zs-chasm.ts): um pedestal de pedra com um cristal em
 * cima, encostado na parede da rampa (fora do caminho de quem corre). APAGADO (cinza-azulado) até você passar; PEGO =
 * aceso (verde); o ÚLTIMO (pra onde volta se cair) mais forte e girando. Sem luz nova (só a cor do material — a regra do pool de luzes), 2 desenhos (instâncias),
 * só na caverna a até DRAW_M do herói.
 */
const DRAW_M = 160;
const OFF = new THREE.Color('#3d5566'), ON = new THREE.Color('#46e08a'), LAST = new THREE.Color('#b8ffd2');
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpE = new THREE.Euler(), tmpC = new THREE.Color();

function glowMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: '#d8f5ff', roughness: 0.25, metalness: 0.1, emissive: '#ffffff', emissiveIntensity: 0.9, flatShading: true });
  // o brilho na cor de cada um (a cor da instância), como os cristais da caverna
  m.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n  totalEmissiveRadiance *= vColor.rgb;\n#endif');
  };
  m.customProgramCacheKey = () => 'zs-chasm-mark-v1';
  return m;
}

export function ZsChasmMarks({ heroRef }: { heroRef: React.MutableRefObject<THREE.Vector3> }) {
  const list = useMemo(() => caveCheckpoints(), []);
  const geo = useMemo(() => ({ gem: new THREE.OctahedronGeometry(0.36, 0).scale(1, 1.9, 1), base: new THREE.CylinderGeometry(0.55, 0.75, 0.9, 7).translate(0, 0.45, 0) }), []);
  // pedestal de pedra com um pouco de brilho próprio (no escuro da caverna não vira um borrão preto)
  const mats = useMemo(() => ({ gem: glowMaterial(), base: new THREE.MeshStandardMaterial({ color: '#6b6258', emissive: '#3a332b', emissiveIntensity: 0.8, roughness: 0.95, flatShading: true }) }), []);
  useEffect(() => () => { geo.gem.dispose(); geo.base.dispose(); mats.gem.dispose(); mats.base.dispose(); }, [geo, mats]);
  const gem = useRef<THREE.InstancedMesh>(null), base = useRef<THREE.InstancedMesh>(null), seen = useRef(-1);
  useEffect(() => {
    const b = base.current, g = gem.current; if (!b || !g) return;
    list.forEach((c, i) => {
      b.setMatrixAt(i, tmpM.compose(tmpP.set(c.mark.x, c.mark.y - 0.05, c.mark.z), tmpQ.setFromEuler(tmpE.set(0, c.yaw, 0)), tmpS.setScalar(1)));
      g.setColorAt(i, OFF); // a cor existe antes de compilar
    });
    b.instanceMatrix.needsUpdate = true; b.computeBoundingSphere();
  }, [list]);
  useFrame((state) => {
    const b = base.current, g = gem.current; if (!b || !g) return;
    const h = heroRef.current, on = zsCave.inCave && list.some((c) => Math.hypot(c.x - h.x, c.z - h.z) < DRAW_M);
    b.visible = g.visible = on;
    if (!on) return;
    const t = state.clock.elapsedTime;
    list.forEach((c, i) => {
      const last = zsChasm.last === c.id, k = last ? 1 : 0;
      tmpQ.setFromEuler(tmpE.set(0, t * (0.4 + k * 1.1) + i, 0));
      g.setMatrixAt(i, tmpM.compose(tmpP.set(c.mark.x, c.mark.y + 1.6 + Math.sin(t * 2 + i) * 0.12 * (1 + k), c.mark.z), tmpQ, tmpS.setScalar(1 + k * 0.2)));
    });
    g.instanceMatrix.needsUpdate = true;
    if (seen.current !== zsChasm.v) {
      seen.current = zsChasm.v;
      list.forEach((c, i) => g.setColorAt(i, tmpC.copy(zsChasm.last === c.id ? LAST : zsChasm.touched.has(c.id) ? ON : OFF)));
      if (g.instanceColor) g.instanceColor.needsUpdate = true;
    }
  });
  return (
    <group>
      <instancedMesh ref={base} args={[geo.base, mats.base, list.length]} />
      <instancedMesh ref={gem} args={[geo.gem, mats.gem, list.length]} frustumCulled={false} />
    </group>
  );
}
