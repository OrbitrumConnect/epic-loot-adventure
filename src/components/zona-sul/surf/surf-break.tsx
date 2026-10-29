/**
 * ZONA SUL — MOTOR DE SURF fase B: a malha da zona de surf (uma só, estática) DOBRADA no shader pela mesma matemática de
 * surf-wave.ts (testada). Onda A-frame: abre pros dois lados a partir do pico, tubo oco com lip projetado, fecha e vira
 * espuma; séries pela SurfScheduler. LEVE: 1 malha, 1 chamada de desenho, só uniforms mudam por quadro (5 ondas × 2 vec4);
 * denso só onde a onda dobra. Celular: malha mais rala. A água em volta não desenha dentro da zona (sem duas águas).
 * O herói boia e o carro passa POR CIMA da onda (`setZsWaterExtra`). Tecla J chama a próxima série (se o mar estiver livre).
 * Chave liga/desliga: `?surf=0` na URL tira tudo (o mar volta exatamente ao de antes).
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { type ZsTerrain, setZsWaterChurn, setZsWaterExtra, setZsWaterPush, setZsWaterTube } from '../zs-terrain-data';
import { ZS_RIPPLE_GLSL, ZS_WATER_LOOK, zsWaterTime } from '../zs-water-look';
import { BARREL_T, BEND, BEND_S, CURL_RAMP, FULL, type Lim, RIPPLE_A, RIPPLE_K, LIP_FOAM_W, LIP_FOAM_X, PEAK_BLEND, SURF, surfChurnAt, surfHeightAt, surfInTubeAt, surfPushAt, TUBE } from './surf-wave';
import { SLOTS, SurfScheduler } from './surf-scheduler';
import { findSurfFrame, type SurfFrame, toSurfLocal } from './surf-frame';

/** A zona de surf atual (a água em volta lê isto pra não desenhar dentro dela). */
export const surfZone = { on: false, frame: null as SurfFrame | null };

/**
 * Faixa (q) onde a onda DOBRA: do pico até onde a abertura mais lenta (−12%) chega na borda da zona e o tubo termina de
 * fechar, mais a curva da crista (pontas adiantadas) e a largura da dobra. Sai das constantes (nada fixo à mão).
 */
export function surfFoldRange(lim: Lim = FULL): [number, number] {
  const vMin = SURF.V_PEEL * 0.88, tEnd = (Math.max(lim[0], lim[1]) + SURF.CLOSE_LAG + SURF.CLOSE_EDGE) / vMin;
  return [SURF.BREAK_Q - 14, SURF.BREAK_Q + SURF.C * tEnd + BEND + 8];
}

/** Linhas da malha (q): densas só onde a onda dobra. */
function surfRows(dense: number, lim: Lim): number[] {
  const rows: number[] = [], [a, b] = surfFoldRange(lim);
  for (let q = SURF.Q_MIN; q < a; q += 2.5) rows.push(q);
  for (let q = a; q < b; q += dense) rows.push(q);
  for (let q = b; q <= SURF.Q_MAX; q += 2) rows.push(q);
  if (rows[rows.length - 1] !== SURF.Q_MAX) rows.push(SURF.Q_MAX);
  return rows;
}

export function buildSurfGeometry(mobile: boolean, lim: Lim = FULL): THREE.BufferGeometry {
  // desktop ~70 mil vértices (1 desenho; só o shader mexe), celular ~24 mil
  // ao longo da onda (s) 1 m basta (a forma muda devagar nesse sentido); só cobre de −limEsq a +limDir (onde há onda)
  const ds = mobile ? 1.4 : 1.0, rows = surfRows(mobile ? 0.5 : 0.3, lim);
  const cols: number[] = []; for (let s = -lim[1]; s < lim[0] - 1e-6; s += ds) cols.push(s);
  cols.push(lim[0]); // borda EXATA (o mar em volta para exatamente aí — sem faixa de duas águas)
  const rest = new Float32Array(rows.length * cols.length * 2), pos = new Float32Array(rows.length * cols.length * 3);
  let k = 0;
  for (const q of rows) for (const s of cols) { rest[k * 2] = s; rest[k * 2 + 1] = q; k++; }
  const idx: number[] = [], nc = cols.length;
  // ordem (s, depois q): a FRENTE do triângulo é o lado do AR (normal pra cima no mar liso; no tubo, pra dentro da
  // cavidade e pra fora do lip). Na ordem inversa a luz era calculada com a água "de cabeça pra baixo".
  for (let j = 0; j + 1 < rows.length; j++) for (let i = 0; i + 1 < nc; i++) { const p = j * nc + i; idx.push(p, p + 1, p + nc, p + 1, p + nc + 1, p + nc); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); // calculada no shader
  g.setAttribute('aRest', new THREE.BufferAttribute(rest, 2));
  g.setIndex(idx);
  return g;
}

const GLSL = /* glsl */ `
uniform vec4 uWa[${SLOTS}];   // qc, h, peelR, peelL
uniform vec4 uWb[${SLOTS}];   // hR, hL, ativa, vR (fase da ondulação da crista)
float gLipX, gLipK; // ponta do lip da onda que dobra (x em raios, peso) — a espuma do lip é feita por PIXEL
uniform vec2 uPeak, uQ, uS;
attribute vec2 aRest;
varying float vFoam;
varying float vCrest;
float sm(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
float bumpW(float x, float h, float st) { float w = x > 0.0 ? 3.4 - 1.4 * st : 7.0; float r = x / w; return h * exp(-r * r); }
float tubeR(float h) { return clamp(h * ${TUBE.K.toFixed(3)}, ${TUBE.MIN.toFixed(3)}, ${TUBE.MAX.toFixed(3)}); }
const float BEND = ${BEND.toFixed(3)}, BS = ${BEND_S.toFixed(3)}, PB = ${PEAK_BLEND.toFixed(3)};
float bendQ(float s) { float k = min(1.0, abs(s) / BS); return BEND * k * k; } // igual a crestQ (surf-wave.ts)
// ponto da elipse do tubo com o ângulo corrigido (pontos por igual na curva) — igual ao P de barrelCurve (surf-wave.ts)
vec2 ellP(float ang, float r, float cq, float cy, float AX) { float a = ang + (AX - 1.0) / (2.0 * (AX + 1.0)) * sin(2.0 * ang); return vec2(cq + AX * r * cos(a), cy + r * sin(a)); }
float tubeAx(float R) { return ${TUBE.AX0.toFixed(3)} + ${TUBE.AXK.toFixed(3)} * R; }
vec2 barrelCurve(float t, float R, float curl, float cl, float rs, float y0, float y1) {
  float wf = ${TUBE.WF.toFixed(3)} * R, wb = ${TUBE.WB.toFixed(3)} * R, Re = R * rs, T = Re * ${TUBE.LIP.toFixed(3)}, AX = tubeAx(R);
  float cq = ${TUBE.CQ.toFixed(3)} * R, cy = ${TUBE.CY.toFixed(3)} * Re;
  float en = radians(150.0 + (-60.0 - 25.0 * cl - 150.0) * curl), st = radians(260.0);
  float A = ${BARREL_T[0].toFixed(4)}, B = ${BARREL_T[1].toFixed(4)}, C = ${BARREL_T[2].toFixed(4)};
  if (t <= A) { float k = t / A; vec2 b = ellP(st, Re, cq, cy, AX); return vec2(wf + (b.x - wf) * k, y0 + (b.y - y0) * sm(0.0, 1.0, k)); }
  if (t <= B) { float a = st + (en - st) * ((t - A) / (B - A)); return ellP(a, Re, cq, cy, AX); }
  if (t <= C) { float k = (t - B) / (C - B); float a = en + (1.5707963 - en) * k; float r = Re + T * sm(0.0, 1.0, min(1.0, k * 3.0)); return ellP(a, r, cq, cy, AX); }
  float k = (t - C) / (1.0 - C); vec2 tp = vec2(cq, cy + Re + T);
  return vec2(tp.x + (-wb - tp.x) * k, tp.y + (y1 - tp.y) * sm(0.0, 1.0, k));
}
// igual a curlOf (surf-wave.ts): x = curl, y = blend, z = rs
vec3 curlOf(float op, float cl, float rp) { return vec3(rp, sm(0.0, 1.0, op) * (1.0 - sm(0.5, 1.0, cl)), (1.0 - 0.5 * cl) * (0.72 + 0.28 * rp)); }
uniform vec2 uLim; // até onde a onda vai: x = direita, y = esquerda (morre na pedra)
float zoneFade(float s, float q) {
  float L = s >= 0.0 ? uLim.x : uLim.y;
  return sm(L, L - ${SURF.EDGE_S.toFixed(1)}, abs(s)) * sm(${SURF.Q_MIN.toFixed(1)}, ${(SURF.Q_MIN + SURF.EDGE_Q0).toFixed(1)}, q) * sm(${SURF.Q_MAX.toFixed(1)}, ${(SURF.Q_MAX - SURF.EDGE_Q1).toFixed(1)}, q);
}
vec4 surfPoint(vec2 sq) {
  float s = sq.x, q0 = sq.y, fade = zoneFade(s, q0);
  float y = 0.0, foam = 0.0, fx = 0.0, fOpen = 0.0, fClosed = 0.0, fSteep = 0.0, fH = 0.0, fQc = 0.0, fRamp = 0.0;
  gLipX = 0.0; gLipK = 0.0;
  bool fold = false;
  for (int i = 0; i < ${SLOTS}; i++) {
    vec4 a = uWa[i]; vec4 b = uWb[i];
    if (b.z < 0.5 || a.y <= 0.0) continue;
    float pk = sm(-PB, PB, s), d = mix(a.w, a.z, pk), aa = abs(s);
    float op = sm(0.0, ${SURF.OPEN_EDGE.toFixed(1)}, d - aa), cl = sm(0.0, ${SURF.CLOSE_EDGE.toFixed(1)}, d - ${SURF.CLOSE_LAG.toFixed(1)} - aa), stp = sm(-18.0, 0.0, d - aa), rp = sm(0.0, ${CURL_RAMP.toFixed(1)}, d - aa);
    float hs = a.y * mix(b.y, b.x, pk) * (1.0 + ${RIPPLE_A.toFixed(3)} * sin(${RIPPLE_K.toFixed(4)} * s + 7.0 * b.w)), x = q0 - a.x - bendQ(s), R = tubeR(hs), wf = ${TUBE.WF.toFixed(3)} * R, wb = ${TUBE.WB.toFixed(3)} * R;
    y += bumpW(x, hs * (1.0 - 0.65 * cl), stp);
    if (curlOf(op, cl, rp).y > 0.001 && x <= wf && x >= -wb) { fold = true; fx = x; fOpen = op; fClosed = cl; fSteep = stp; fH = hs; fQc = a.x + bendQ(s); fRamp = rp; gLipX = x / R; gLipK = op * (1.0 - cl); }
    float r1 = (x + 1.0) / 5.0;
    foam = max(foam, cl * exp(-r1 * r1)); // espuma de depois de fechar (larga, suave); a do lip vai pro pixel
  }
  float q = q0;
  if (fold) {
    float R = tubeR(fH), wf = ${TUBE.WF.toFixed(3)} * R, wb = ${TUBE.WB.toFixed(3)} * R, hh = fH * (1.0 - 0.65 * fClosed);
    vec3 cu = curlOf(fOpen, fClosed, fRamp);
    float t = (wf - fx) / (wf + wb);
    vec2 c = barrelCurve(t, R, cu.x, fClosed, cu.z, bumpW(wf, hh, fSteep), bumpW(-wb, hh, fSteep));
    q = fQc + fx + (c.x - fx) * cu.y;
    y = y + (c.y - y) * cu.y;
  }
  gLipK *= fade;
  return vec4(s, y * fade, q0 + (q - q0) * fade, foam * fade);
}
vec3 toWorld(vec4 p) { return vec3(uPeak.x + uS.x * p.x + uQ.x * p.z, p.y, uPeak.y + uS.y * p.x + uQ.y * p.z); }
`;

function surfMaterial(uniforms: Record<string, THREE.IUniform>): THREE.MeshStandardMaterial {
  // MESMO visual do mar em volta (cor, transparência, ondulação, relógio): sem retângulo de outra cor na zona
  const m = new THREE.MeshStandardMaterial({ ...ZS_WATER_LOOK, transparent: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.uniforms['uTime'] = zsWaterTime;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWaveXZ;\nvarying float vLipX;\nvarying float vLipK;\n' + GLSL)
      .replace('#include <beginnormal_vertex>', `vec4 sp0 = surfPoint(aRest);
  vLipX = gLipX; vLipK = gLipK; // antes das outras 2 chamadas (que sobrescrevem gLip*)
  vec3 wp0 = toWorld(sp0), wps = toWorld(surfPoint(aRest + vec2(0.6, 0.0))), wpq = toWorld(surfPoint(aRest + vec2(0.0, 0.3)));
  vec3 objectNormal = normalize(cross(wps - wp0, wpq - wp0));
  vFoam = sp0.w; vCrest = clamp(sp0.y / 3.2, 0.0, 1.0); vWaveXZ = wp0.xz;`)
      .replace('#include <begin_vertex>', 'vec3 transformed = wp0;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec2 vWaveXZ;\nvarying float vFoam;\nvarying float vCrest;\nvarying float vLipX;\nvarying float vLipK;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>' + ZS_RIPPLE_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
  // água fina no alto da onda: verde-água discreto (luz atravessando) — cores LINEARES, por isso valores baixos
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.035, 0.30, 0.30), vCrest * 0.5);
  diffuseColor.a = mix(diffuseColor.a, 0.9, vCrest);
  // espuma branca só na ponta do lip (calculada POR PIXEL — borda lisa, sem "degraus" da malha) e depois de fechar
  float lr = (vLipX + ${LIP_FOAM_X.toFixed(3)}) / ${LIP_FOAM_W.toFixed(3)};
  float fo = clamp(max(vFoam, vLipK * exp(-lr * lr) * 0.7) * 1.25, 0.0, 0.92);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.96, 0.97), fo);
  diffuseColor.a = mix(diffuseColor.a, 1.0, fo);`);
  };
  m.customProgramCacheKey = () => 'zs-surf-v3';
  return m;
}

export function SurfBreak({ t, shoreX, shoreZ }: { t: ZsTerrain; shoreX: number; shoreZ: number }) {
  const frame = useMemo(() => findSurfFrame(t, shoreX, shoreZ), [t, shoreX, shoreZ]);
  const scheduler = useMemo(() => new SurfScheduler(), []);
  const mobile = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
  const geometry = useMemo(() => buildSurfGeometry(mobile, frame?.lim ?? FULL), [mobile, frame]);
  const uniforms = useMemo(() => ({
    uWa: { value: Array.from({ length: SLOTS }, () => new THREE.Vector4()) },
    uWb: { value: Array.from({ length: SLOTS }, () => new THREE.Vector4()) },
    uPeak: { value: new THREE.Vector2() }, uQ: { value: new THREE.Vector2() }, uS: { value: new THREE.Vector2() }, uLim: { value: new THREE.Vector2(SURF.ZONE_S, SURF.ZONE_S) },
  }), []);
  const material = useMemo(() => surfMaterial(uniforms), [uniforms]);

  useEffect(() => {
    if (!frame) return;
    uniforms.uPeak.value.set(frame.px, frame.pz); uniforms.uQ.value.set(frame.qx, frame.qz); uniforms.uS.value.set(frame.sx, frame.sz); uniforms.uLim.value.set(frame.lim[0], frame.lim[1]);
    surfZone.on = true; surfZone.frame = frame;
    // só em desenvolvimento: testes de tela leem a agenda e a zona
    if (import.meta.env.DEV) (window as unknown as { __zsSurf?: unknown }).__zsSurf = { scheduler, frame };
    const inZone = (s: number, q: number) => s >= -frame.lim[1] && s <= frame.lim[0] && q >= SURF.Q_MIN && q <= SURF.Q_MAX;
    setZsWaterExtra((x, z, yRef) => { const [s, q] = toSurfLocal(frame, x, z); return inZone(s, q) ? surfHeightAt(s, q, scheduler.states, scheduler.vars, yRef, frame.lim) : 0; });
    // a onda EMPURRA quem boia (carro parado na água, herói nadando) rumo à praia
    setZsWaterPush((x, z, out, yRef) => {
      const [s, q] = toSurfLocal(frame, x, z); if (!inZone(s, q)) return false;
      const p = surfPushAt(s, q, scheduler.states, scheduler.vars, frame.lim, yRef); if (p < 0.02) return false;
      out.x = frame.qx * p; out.z = frame.qz * p; return true;
    });
    const key = (e: KeyboardEvent) => { if (e.code === 'KeyJ' && !e.repeat) scheduler.trigger(); };
    window.addEventListener('keydown', key);
    setZsWaterTube((x, z, yRef) => { const [s, q] = toSurfLocal(frame, x, z); return inZone(s, q) && surfInTubeAt(s, q, scheduler.states, scheduler.vars, yRef, frame.lim); });
    setZsWaterChurn((x, z) => { const [s, q] = toSurfLocal(frame, x, z); return inZone(s, q) ? surfChurnAt(s, q, scheduler.states, scheduler.vars, frame.lim) : 0; });
    return () => { surfZone.on = false; surfZone.frame = null; setZsWaterExtra(null); setZsWaterPush(null); setZsWaterChurn(null); setZsWaterTube(null); window.removeEventListener('keydown', key); };
  }, [frame, uniforms, scheduler]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  useFrame((_, dt) => {
    scheduler.advance(dt);
    for (let i = 0; i < SLOTS; i++) {
      const s = scheduler.states[i]!, v = scheduler.vars[i]!;
      uniforms.uWa.value[i]!.set(s.qc, s.h, s.peelR, s.peelL);
      uniforms.uWb.value[i]!.set(v.hR, v.hL, s.active ? 1 : 0, v.vR);
    }
  });
  if (!frame) return null;
  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={2} receiveShadow />;
}
