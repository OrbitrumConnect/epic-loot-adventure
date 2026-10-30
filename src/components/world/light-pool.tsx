/**
 * POOL DE LUZES (30/10, Pedro: "o lag está aumentando"). Medido na Zona Sul:
 *  1. MUDAR a quantidade de luzes na cena faz o three RECOMPILAR o shader de TODOS os materiais (travada de 0,3–2 s) — a
 *     fogueira do acampamento acendia a luz dela a 26 m, a tocha ao equipar, o brilho do skate ao subir nele;
 *  2. cada luz pontual custa em TODO pixel da tela, mesmo com força 0 — as 6 dos postes eram ~25% do quadro, até de dia.
 * Com o pool ATIVO (Zona Sul): N luzes FIXAS (PC 4 · celular 2). Quem quer luz PEDE a cada quadro (`requestLight`) e o
 * pool dá as vagas aos pedidos MAIS PERTO do herói. Sem pedido nenhum (dia, longe de fogueira/tocha) o grupo inteiro sai
 * da cena = zero custo. Trocar entre "com luzes" e "sem luzes" só acontece DEPOIS que o shader do outro jeito está
 * compilado (`compileAsync`, em paralelo) → a troca não trava. Pool inativo (Vale): cada luz segue como sempre foi.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export const lightPool = { active: false };
/** o grupo das luzes do pool (o pré-aquecimento compila os materiais com e sem as luzes) */
export const lightPoolGroup: { g: THREE.Group | null } = { g: null };

export type LightReq = { x: number; y: number; z: number; color: THREE.Color; intensity: number; distance: number; decay: number };
const reqs: LightReq[] = [];
let used = 0;

/** Pede uma luz pontual NESTE quadro. `false` = pool inativo (use a sua luz de sempre). */
export function requestLight(x: number, y: number, z: number, color: THREE.ColorRepresentation, intensity: number, distance: number, decay: number): boolean {
  if (!lightPool.active) return false;
  if (!(intensity > 0)) return true;
  let r = reqs[used];
  if (!r) { r = { x: 0, y: 0, z: 0, color: new THREE.Color(), intensity: 0, distance: 0, decay: 1 }; reqs[used] = r; }
  used++;
  r.x = x; r.y = y; r.z = z; r.color.set(color); r.intensity = intensity; r.distance = distance; r.decay = decay;
  return true;
}

/** As `n` vagas: os pedidos mais perto de (hx, hz), do mais perto pro mais longe. Puro (testável). */
export function pickLights(list: readonly LightReq[], count: number, hx: number, hz: number, n: number): LightReq[] {
  const out: LightReq[] = [], d: number[] = [];
  for (let i = 0; i < count; i++) {
    const r = list[i]!, dd = (r.x - hx) ** 2 + (r.z - hz) ** 2;
    if (out.length < n) { out.push(r); d.push(dd); }
    else {
      let w = 0; for (let k = 1; k < n; k++) if (d[k]! > d[w]!) w = k;
      if (dd < d[w]!) { out[w] = r; d[w] = dd; }
    }
  }
  const idx = out.map((_, i) => i).sort((a, b) => d[a]! - d[b]!);
  return idx.map((i) => out[i]!);
}

export function LightPool({ size, focus }: { size: number; focus: React.MutableRefObject<THREE.Vector3> }) {
  const group = useRef<THREE.Group>(null);
  const lights = useRef<(THREE.PointLight | null)[]>([]);
  const { gl, scene, camera } = useThree();
  /** o que está NA cena (true = luzes no shader) e se uma troca está compilando */
  const shown = useRef(false), switching = useRef(false);
  /** último quadro com pedido (apaga só depois de 2 s sem pedido: na borda do raio da fogueira não fica liga/desliga) */
  const lastReq = useRef(-Infinity);
  useEffect(() => {
    lightPool.active = true;
    lightPoolGroup.g = group.current;
    return () => { lightPool.active = false; used = 0; lightPoolGroup.g = null; };
  }, []);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const n = used;
    used = 0;
    const now = performance.now();
    if (n > 0) lastReq.current = now;
    const want = n > 0 || now - lastReq.current < 2000;
    if (want !== shown.current && !switching.current) {
      // compila o OUTRO jeito sem trocar ainda; troca quando o shader estiver pronto (sem travada)
      switching.current = true;
      g.visible = want;
      gl.compileAsync(scene, camera)
        .then(() => { shown.current = want; })
        .catch(() => { shown.current = want; })
        .finally(() => { switching.current = false; });
    }
    g.visible = shown.current;
    const picked = shown.current && n > 0 ? pickLights(reqs, n, focus.current.x, focus.current.z, size) : [];
    for (let i = 0; i < size; i++) {
      const l = lights.current[i];
      if (!l) continue;
      const r = picked[i];
      if (!r) { l.intensity = 0; continue; }
      l.position.set(r.x, r.y, r.z); l.color.copy(r.color);
      l.intensity = r.intensity; l.distance = r.distance; l.decay = r.decay;
    }
  });
  return (
    <group ref={group} visible={false}>
      {Array.from({ length: size }, (_, i) => (
        <pointLight key={i} ref={(l) => { lights.current[i] = l; }} intensity={0} distance={20} decay={1.5} position={[0, -1000, 0]} />
      ))}
    </group>
  );
}
