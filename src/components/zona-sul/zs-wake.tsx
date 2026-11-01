/**
 * ZONA SUL — RASTRO NA ÁGUA (Pedro 01/11: "falta rastro no navio andando" · "no surf, em pé, falta o rastro na água
 * saindo da prancha"). Uma faixa de espuma que sai da popa/rabeta: cada amostra guarda onde a popa passou; a faixa ABRE
 * com o tempo (esteira se espalhando) e some suave (alfa por vértice). Bordas mais brancas que o meio (como a esteira de
 * verdade). Segue a superfície da água com a onda. UMA malha por rastro (1 desenho), poucos vértices.
 */
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { zsWaterYAt } from './zs-terrain-data';

/** De onde sai o rastro agora (quem anda escreve todo quadro). */
export type WakeSource = { active: boolean; x: number; z: number; yaw: number; speed: number };
export type WakeLook = {
  /** largura inicial e quanto abre por segundo (m) */ width: number; spread: number;
  /** vida de cada pedaço (s), distância entre amostras (m), velocidade mínima pra deixar rastro (m/s) */ life: number; seg: number; minSpeed: number;
  /** alfa máximo (borda) e do meio */ alpha: number; mid: number;
};
export const WAKE_SHIP: WakeLook = { width: 6, spread: 1.5, life: 7, seg: 2.2, minSpeed: 0.8, alpha: 0.5, mid: 0.16 };
export const WAKE_BOARD: WakeLook = { width: 0.55, spread: 0.5, life: 2.4, seg: 0.45, minSpeed: 1.5, alpha: 0.7, mid: 0.35 };
/** A prancha (o herói escreve quando está EM PÉ na onda). */
export const zsBoardWake: WakeSource = { active: false, x: 0, z: 0, yaw: 0, speed: 0 };

const MAX = 48;

export function ZsWake({ source, look }: { source: () => WakeSource | null; look: WakeLook }) {
  const samples = useRef<{ x: number; z: number; px: number; pz: number; t: number }[]>([]);
  const { mesh, geo } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX * 3 * 4), 4).setUsage(THREE.DynamicDrawUsage));
    const idx: number[] = [];
    for (let i = 0; i < MAX - 1; i++) {
      const a = i * 3, b = (i + 1) * 3;
      idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
    }
    g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.frustumCulled = false; m.renderOrder = 2; m.raycast = () => {};
    return { mesh: m, geo: g };
  }, []);

  useFrame((state) => {
    const now = state.clock.elapsedTime, s = source(), list = samples.current;
    // nova amostra quando a popa andou `seg` metros (e está rápido o bastante)
    if (s && s.active && Math.abs(s.speed) >= look.minSpeed) {
      const last = list[0];
      if (!last || Math.hypot(s.x - last.x, s.z - last.z) >= look.seg) {
        list.unshift({ x: s.x, z: s.z, px: Math.cos(s.yaw), pz: -Math.sin(s.yaw), t: now });
        if (list.length > MAX) list.length = MAX;
      }
    }
    while (list.length && now - list[list.length - 1]!.t > look.life) list.pop();
    const pos = geo.getAttribute('position') as THREE.BufferAttribute, col = geo.getAttribute('color') as THREE.BufferAttribute;
    const n = list.length;
    mesh.visible = n >= 2;
    if (n < 2) return;
    for (let i = 0; i < n; i++) {
      const sm = list[i]!, age = (now - sm.t) / look.life, w = (look.width + look.spread * (now - sm.t)) / 2;
      const y = zsWaterYAt(sm.x, sm.z) + 0.07;
      const fade = Math.pow(Math.max(0, 1 - age), 1.5) * Math.min(1, i / 2 + 0.3); // nasce suave junto da popa
      pos.setXYZ(i * 3, sm.x - sm.px * w, y, sm.z - sm.pz * w);
      pos.setXYZ(i * 3 + 1, sm.x, y, sm.z);
      pos.setXYZ(i * 3 + 2, sm.x + sm.px * w, y, sm.z + sm.pz * w);
      col.setXYZW(i * 3, 0.95, 0.98, 1, look.alpha * fade);
      col.setXYZW(i * 3 + 1, 0.92, 0.97, 1, look.mid * fade);
      col.setXYZW(i * 3 + 2, 0.95, 0.98, 1, look.alpha * fade);
    }
    pos.needsUpdate = true; col.needsUpdate = true;
    geo.setDrawRange(0, (n - 1) * 12);
  });
  return <primitive object={mesh} />;
}
