/**
 * ZONA SUL — DIA/NOITE + LUA + POSTES NAS PISTAS (29/10, Pedro: "pôr os postes na pista de barro, dia/noite").
 *  - MESMO relógio do jogo (`dayNight`/`nightFactor`/`gameHour`, 42 min por dia, noite mais longa, igual na sala online):
 *    as CORES vêm dos quadros-chave do Vale; a intensidade é a da luz da Zona Sul. O sol nasce no LESTE e se põe no OESTE
 *    passando pelo NORTE (hemisfério sul); de noite a luz vira o luar azulado e o céu escurece de verdade.
 *  - POSTES: na BEIRA das pistas (tipo de chão "pista" do bake), a cada ~36 m. Desenha só os mais perto (uma chamada
 *    de desenho — instâncias) e acende LUZ de verdade só nos 4 mais perto (celular 2) — o resto é a lâmpada que brilha.
 * Tudo a ~4×/s (não por quadro) e sem alocar memória por quadro.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { dayNight, gameHour, nightFactor } from '@/game/systems/dayNightSystem';
import { requestLight } from '@/components/world/light-pool';
import { type ZsTerrain, zsHeightAt, zsSlopeDeg } from './zs-terrain-data';
import { ZS_SURF } from './zona-sul-meta';

/** Sol/luar compartilhado: o herói posiciona a luz direcional (e a sombra) com isto. */
export const zsSun = { dir: new THREE.Vector3(-0.55, 0.62, -0.45).normalize(), intensity: 2.1, color: new THREE.Color('#fff4e0') };

const DAY_FOG = new THREE.Color('#bcd0dc');
const MOON_DIR = new THREE.Vector3(0.35, 0.8, 0.45).normalize();
// NOITE DE LUA CHEIA (Pedro 30/10: "a noite tá um breu… pode ser aquela noite de lua cheia que fica mais claro"):
// luar prateado forte, céu/névoa azul-acinzentados (não preto), sombras do luar visíveis.
const HEMI_DAY = new THREE.Color('#eef4f8'), HEMI_NIGHT = new THREE.Color('#9fb3e6');
const GROUND_DAY = new THREE.Color('#6b7a4a'), GROUND_NIGHT = new THREE.Color('#2c3448');
const MOON_LIGHT = new THREE.Color('#c9d8ff'), NIGHT_FOG = new THREE.Color('#3b4a6e');
/** intensidades da NOITE (lua cheia): luar, céu (hemisfério), ambiente. Pedro 30/10: "pode escurecer uns 10–15%"
 *  → 13% abaixo de antes (1,25 / 0,85 / 0,3). */
export const NIGHT_LIGHT = { moon: 1.09, hemi: 0.74, amb: 0.26 } as const;
const tmpC = new THREE.Color(), sunV = new THREE.Vector3();

/** Direção do sol pela hora do jogo: nasce a leste (+x) às 6h, passa pelo norte (−z), põe a oeste às 18h. */
export function sunDirAt(hour: number, out = new THREE.Vector3()): THREE.Vector3 {
  const a = ((hour - 6) / 12) * Math.PI;
  return out.set(Math.cos(a) * 0.8, Math.sin(a) * 0.9, -0.45).normalize();
}

export function ZsDayNight({ hemi, amb, sky }: {
  hemi: React.RefObject<THREE.HemisphereLight | null>;
  amb: React.RefObject<THREE.AmbientLight | null>;
  /** o céu (drei/three-stdlib Sky): só lemos o uniform do sol */
  sky: { readonly current: unknown };
}) {
  const { scene, camera } = useThree();
  const acc = useRef(1);
  const moon = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    // a lua acompanha a câmera (longe, fixa no céu) — barato, todo quadro
    const m = moon.current;
    const nf = nightFactor();
    if (m) {
      m.visible = nf > 0.12;
      if (m.visible) { m.position.copy(camera.position).addScaledVector(MOON_DIR, 2500); m.lookAt(camera.position); }
    }
    acc.current += dt;
    if (acc.current < 0.25) return;
    acc.current = 0;
    const dn = dayNight(), h = gameHour();
    sunDirAt(h, sunV);
    // luz principal: o SOL de dia, o LUAR de noite (mesma luz direcional, cor e direção mudam)
    zsSun.dir.copy(sunV.y > 0.05 ? sunV : MOON_DIR).lerp(MOON_DIR, nf).normalize();
    zsSun.intensity = THREE.MathUtils.lerp(2.1 * Math.min(1.15, dn.sunIntensity / 3.25), NIGHT_LIGHT.moon, nf);
    zsSun.color.set(dn.sunColor).lerp(MOON_LIGHT, nf); // de noite o luar é prateado (não o azul escuro do relógio)
    if (hemi.current) {
      hemi.current.intensity = THREE.MathUtils.lerp(1.5, NIGHT_LIGHT.hemi, nf);
      hemi.current.color.copy(HEMI_DAY).lerp(HEMI_NIGHT, nf);
      hemi.current.groundColor.copy(GROUND_DAY).lerp(GROUND_NIGHT, nf);
    }
    if (amb.current) { amb.current.intensity = THREE.MathUtils.lerp(0.35, NIGHT_LIGHT.amb, nf); amb.current.color.set(dn.ambientColor); }
    // névoa/fundo: a cor do dia da Zona Sul, puxando a do relógio no amanhecer/entardecer e de noite
    // dia: a cor da Zona Sul puxando a do relógio (amanhecer/entardecer); noite: azul-acinzentado de lua cheia
    tmpC.copy(DAY_FOG).lerp(new THREE.Color(dn.fogColor), 0.3 * (1 - nf)).lerp(NIGHT_FOG, nf);
    if (scene.fog) (scene.fog as THREE.Fog).color.copy(tmpC);
    if (scene.background instanceof THREE.Color) scene.background.copy(tmpC);
    // céu: o sol do shader segue a hora (abaixo do horizonte = céu escuro de verdade)
    const u = ((sky.current as THREE.Mesh | null)?.material as THREE.ShaderMaterial | undefined)?.uniforms;
    if (u?.['sunPosition']) (u['sunPosition'].value as THREE.Vector3).copy(sunV).multiplyScalar(1000);
  });
  return (
    <group ref={moon} visible={false}>
      <mesh renderOrder={2}><circleGeometry args={[70, 48]} /><meshBasicMaterial color="#f4f6ff" fog={false} depthWrite={false} toneMapped={false} /></mesh>
      <mesh renderOrder={1}><circleGeometry args={[150, 48]} /><meshBasicMaterial color="#9fb3e6" transparent opacity={0.18} fog={false} depthWrite={false} toneMapped={false} /></mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ postes */

/** Altura do poste (m) — a mesma do Vale (+30% e +1 m, Pedro 25/10). */
const LAMP_H = 5.2;
/** Distância entre postes na beira da pista (m). */
export const LAMP_SPACING = 36;
const LAMP_MAX_DRAWN = 14, LAMP_DRAW_R = 150;

/** Pontos dos postes: célula de terra SECA colada numa célula de PISTA, plana, a cada ~36 m. Puro (testável). */
export function zsLampSpots(t: ZsTerrain, spacing = LAMP_SPACING, max = 600): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  // grade de exclusão (células de `spacing` m): cada candidato só olha os postes das 9 células em volta
  const grid = new Map<string, { x: number; z: number }[]>();
  const key = (gx: number, gz: number) => `${gx},${gz}`;
  const near = (x: number, z: number) => {
    const gx = Math.floor(x / spacing), gz = Math.floor(z / spacing);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      for (const p of grid.get(key(gx + a, gz + b)) ?? []) if ((p.x - x) ** 2 + (p.z - z) ** 2 < spacing * spacing) return true;
    }
    return false;
  };
  for (let j = 1; j < t.h - 1 && out.length < max; j++) {
    for (let i = 1; i < t.w - 1 && out.length < max; i++) {
      const p = j * t.w + i;
      if (t.surf[p] !== ZS_SURF.land && t.surf[p] !== ZS_SURF.forest) continue;
      if (t.heights[p]! < 0.8) continue;
      const nextToRoad = t.surf[p - 1] === ZS_SURF.road || t.surf[p + 1] === ZS_SURF.road || t.surf[p - t.w] === ZS_SURF.road || t.surf[p + t.w] === ZS_SURF.road;
      if (!nextToRoad) continue;
      const x = t.x0 + i * t.cell, z = t.z0 + j * t.cell;
      if (zsSlopeDeg(t, x, z) > 18 || near(x, z)) continue;
      const s = { x, z };
      out.push(s);
      const k = key(Math.floor(x / spacing), Math.floor(z / spacing));
      (grid.get(k) ?? grid.set(k, []).get(k)!).push(s);
    }
  }
  return out;
}

const LAMP_URL = '/zona-sul/lamp.glb';
/** quantos postes (os mais perto) pedem luz ao pool por quadro — o pool usa só as vagas que tem (PC 4 · celular 2) */
const LAMP_LIGHTS = 6, LAMP_COLOR = new THREE.Color('#ffd59a');
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), ONE = new THREE.Vector3(1, 1, 1), tmpP = new THREE.Vector3();

export function ZsLamps({ t, heroRef }: { t: ZsTerrain; heroRef: React.MutableRefObject<THREE.Vector3> }) {
  const spots = useMemo(() => zsLampSpots(t).map((s) => ({ ...s, y: zsHeightAt(t, s.x, s.z) })), [t]);
  const { scene: glb } = useGLTF(LAMP_URL);
  // geometria do poste JÁ no tamanho certo (5,2 m, pé no chão, centrado) — uma vez
  const { geo, mat } = useMemo(() => {
    const root = glb.clone(true);
    root.updateMatrixWorld(true);
    let mesh: THREE.Mesh | null = null;
    root.traverse((o) => { if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh; });
    const g = (mesh as THREE.Mesh | null)?.geometry.clone() ?? new THREE.BoxGeometry(0.2, 1, 0.2);
    // o GLB vem QUANTIZADO (posição em inteiro normalizado −1..1): esticar pra 5,2 m cortava tudo acima de 1 → o poste
    // virava um toco de 2 m. Passa pra float antes de transformar.
    const pos = g.getAttribute('position');
    if (pos && !(pos.array instanceof Float32Array)) {
      const f = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) { f[i * 3] = pos.getX(i); f[i * 3 + 1] = pos.getY(i); f[i * 3 + 2] = pos.getZ(i); }
      g.setAttribute('position', new THREE.Float32BufferAttribute(f, 3));
    }
    if (mesh) g.applyMatrix4((mesh as THREE.Mesh).matrixWorld);
    g.computeBoundingBox();
    const b = g.boundingBox!, k = LAMP_H / Math.max(1e-6, b.max.y - b.min.y);
    g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
    g.scale(k, k, k);
    return { geo: g, mat: ((mesh as THREE.Mesh | null)?.material as THREE.Material) ?? new THREE.MeshStandardMaterial({ color: '#555' }) };
  }, [glb]);
  const posts = useRef<THREE.InstancedMesh>(null);
  const bulbs = useRef<THREE.InstancedMesh>(null);
  const bulbMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffd391', transparent: true, opacity: 0, toneMapped: false, depthWrite: false }), []);
  const nearest = useRef<number[]>([]);
  const acc = useRef(1);
  useEffect(() => () => { geo.dispose(); bulbMat.dispose(); }, [geo, bulbMat]);
  useFrame((_, dt) => {
    const nf = nightFactor();
    // luzes acesas (tremeluzindo) à noite: os postes mais perto PEDEM vaga no POOL de luzes (light-pool.tsx) — ele
    // tem um número FIXO de luzes (sem recompilar materiais) e de dia, sem pedido, tira as luzes do shader (custo zero)
    if (nf > 0.04) {
      const near = nearest.current, now = performance.now();
      for (let i = 0; i < Math.min(LAMP_LIGHTS, near.length); i++) {
        const s = spots[near[i]!]!;
        requestLight(s.x, s.y + LAMP_H * 0.9, s.z, LAMP_COLOR, nf * 38 * (0.93 + Math.sin(now * 0.006 + i * 1.3) * 0.07), 30, 1.25);
      }
    }
    bulbMat.opacity = Math.min(1, nf * 1.6);
    acc.current += dt;
    if (acc.current < 0.5) return;
    acc.current = 0;
    // os postes MAIS PERTO do herói (até 150 m) entram no desenho; os demais nem são processados
    const h = heroRef.current, r2 = LAMP_DRAW_R * LAMP_DRAW_R;
    const cand: { i: number; d: number }[] = [];
    for (let i = 0; i < spots.length; i++) { const s = spots[i]!; const d = (s.x - h.x) ** 2 + (s.z - h.z) ** 2; if (d < r2) cand.push({ i, d }); }
    cand.sort((a, b) => a.d - b.d);
    const n = Math.min(LAMP_MAX_DRAWN, cand.length);
    nearest.current = cand.slice(0, n).map((c) => c.i);
    const pm = posts.current, bm = bulbs.current;
    if (!pm || !bm) return;
    for (let k = 0; k < n; k++) {
      const s = spots[cand[k]!.i]!;
      pm.setMatrixAt(k, tmpM.compose(tmpP.set(s.x, s.y, s.z), tmpQ, ONE));
      bm.setMatrixAt(k, tmpM.compose(tmpP.set(s.x, s.y + LAMP_H * 0.9, s.z), tmpQ, ONE));
    }
    pm.count = n; bm.count = n;
    pm.instanceMatrix.needsUpdate = true; bm.instanceMatrix.needsUpdate = true;
    pm.computeBoundingSphere(); bm.computeBoundingSphere();
  });
  return (
    <>
      <instancedMesh ref={posts} args={[geo, mat, LAMP_MAX_DRAWN]} castShadow frustumCulled={false} />
      <instancedMesh ref={bulbs} args={[undefined, bulbMat, LAMP_MAX_DRAWN]} frustumCulled={false}>
        <sphereGeometry args={[0.36, 10, 8]} />
      </instancedMesh>
    </>
  );
}
useGLTF.preload(LAMP_URL);
