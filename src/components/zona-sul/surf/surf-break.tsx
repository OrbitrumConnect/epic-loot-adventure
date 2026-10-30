/**
 * ZONA SUL — MOTOR DE SURF fase B: a malha da zona de surf (uma só, estática) DOBRADA no shader pela mesma matemática de
 * surf-wave.ts (testada). Onda A-frame: abre pros dois lados a partir do pico, tubo oco com lip projetado, fecha e vira
 * espuma; séries pela SurfScheduler. LEVE: 1 malha, 1 chamada de desenho, só uniforms mudam por quadro (5 ondas × 2 vec4);
 * denso só onde a onda dobra. Celular: malha mais rala. A água em volta não desenha dentro da zona (sem duas águas).
 * O herói boia e o carro passa POR CIMA da onda (`setZsWaterExtra`). Tecla J chama a próxima série (se o mar estiver livre).
 * Chave liga/desliga: `?surf=0` na URL tira tudo (o mar volta exatamente ao de antes).
 * 30/10 (SORRISO): cada pico tem o seu PERFIL (surf-wave.ts) e se registra em surf-zones.ts. O shader é gerado pelo perfil
 * — o do Arpoador sai IGUAL ao de antes (o trecho da 2ª quebra e o lip "cheio" só entram em perfil que tem).
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ZsTerrain } from '../zs-terrain-data';
import { ZS_RIPPLE_GLSL, ZS_WATER_LOOK, zsWaterTime } from '../zs-water-look';
import { ARPOADOR, BARREL_T, CURL_RAMP, FULL, type Lim, RIPPLE_A, RIPPLE_K, SHOULDER_DROP, SHOULDER_HOLD, SHOULDER_LEN, STEEP_AHEAD, FACE_W, LIP_FOAM_W, LIP_FOAM_X, PEAK_BLEND, type SurfProfile, TUBE } from './surf-wave';
import { type SeriesRule, SERIES, SLOTS, SurfScheduler } from './surf-scheduler';
import { findSurfFrame, type SurfFrame } from './surf-frame';
import { nearestSurfZone, registerSurfZone, type SurfZoneInfo } from './surf-zones';
/** Até que distância (m) da câmera a malha da onda é desenhada. */
const SURF_DRAW_DIST = 900;

/**
 * Faixa (q) onde a onda DOBRA: do pico até onde a abertura mais lenta (−12%) chega na borda da zona e o tubo termina de
 * fechar, mais a curva da crista (pontas adiantadas) e a largura da dobra. Sai das constantes (nada fixo à mão).
 */
export function surfFoldRange(lim: Lim = FULL, pf: SurfProfile = ARPOADOR, breakQ = pf.BREAK_Q, vPeel = pf.V_PEEL): [number, number] {
  const vMin = vPeel * 0.88, tEnd = (Math.max(lim[0], lim[1]) + pf.CLOSE_LAG + pf.CLOSE_EDGE) / vMin;
  return [breakQ - 14, breakQ + pf.C * tEnd + pf.BEND + 8];
}

/** Malha por perfil: espaçamento ao longo da onda (ds) e nas faixas que dobram (Arpoador: igual a antes). */
export type SurfMeshRule = { ds: number; dsMobile: number; dense: number; denseMobile: number; denseOuter?: number; denseOuterMobile?: number };
export const ARPOADOR_MESH: SurfMeshRule = { ds: 1.0, dsMobile: 1.4, dense: 0.25, denseMobile: 0.5 };

/** Linhas da malha (q) de um perfil novo: densas só onde a onda dobra — nas seções de fora (`denseOuter`) e na ÚLTIMA,
 *  a da beira, com o tubo (`dense`); 2,5 m no resto (sem pular o começo de uma faixa densa). */
function surfRows(dense: number, lim: Lim, pf: SurfProfile, denseOuter = dense): number[] {
  const secs = [{ Q: pf.BREAK_Q, V_PEEL: pf.V_PEEL }, ...pf.INNER];
  const bands: [number, number, number][] = secs.map((x, i) => [...surfFoldRange(lim, pf, x.Q, x.V_PEEL), i === secs.length - 1 && secs.length > 1 ? dense : denseOuter]);
  const rows: number[] = [];
  let q = pf.Q_MIN;
  while (q < pf.Q_MAX - 1e-6) {
    rows.push(q);
    const steps = bands.filter(([a0, b0]) => q >= a0 && q < b0).map(([, , st]) => st);
    let step = steps.length ? Math.min(...steps) : 2.5;
    const next = bands.map(([a0]) => a0).filter((a0) => a0 > q).sort((x, y) => x - y)[0];
    if (!steps.length && next !== undefined && q + step > next) step = Math.max(0.05, next - q);
    q += step;
  }
  rows.push(pf.Q_MAX);
  return rows;
}

/** Linhas do Arpoador — a mesma conta de antes (malha idêntica). */
function surfRowsArpoador(dense: number, lim: Lim): number[] {
  const pf = ARPOADOR, rows: number[] = [], [a, b] = surfFoldRange(lim, pf);
  for (let q = pf.Q_MIN; q < a; q += 2.5) rows.push(q);
  for (let q = a; q < b; q += dense) rows.push(q);
  for (let q = b; q <= pf.Q_MAX; q += 2) rows.push(q);
  if (rows[rows.length - 1] !== pf.Q_MAX) rows.push(pf.Q_MAX);
  return rows;
}

export function buildSurfGeometry(mobile: boolean, lim: Lim = FULL, pf: SurfProfile = ARPOADOR, mesh: SurfMeshRule = ARPOADOR_MESH): THREE.BufferGeometry {
  // desktop ~70 mil vértices (1 desenho; só o shader mexe), celular ~24 mil
  // ao longo da onda (s) 1 m basta (a forma muda devagar nesse sentido); só cobre de −limEsq a +limDir (onde há onda)
  const ds = mobile ? mesh.dsMobile : mesh.ds;
  const rows = pf === ARPOADOR ? surfRowsArpoador(mobile ? mesh.denseMobile : mesh.dense, lim) : surfRows(mobile ? mesh.denseMobile : mesh.dense, lim, pf, (mobile ? mesh.denseOuterMobile : mesh.denseOuter) ?? (mobile ? mesh.denseMobile : mesh.dense));
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

function surfGlsl(pf: SurfProfile): string {
  const inner = pf.INNER.length > 0;
  // SEÇÕES (só perfis que têm): a espuma da de base se desfaz (reform) e vale a abertura da próxima — igual a barrelAt.
  // uWc = peel2R, peel2L, reform, stB · uWd = stA, lagA, outer
  const innerGlsl = inner ? `
    if (rf > 0.0) { float d2 = mix(c2.y, c2.x, pk);
      op = mix(op, sm(0.0, ${pf.OPEN_EDGE.toFixed(1)}, d2 - aa), rf); cl = mix(cl, sm(0.0, ${pf.CLOSE_EDGE.toFixed(1)}, d2 - ${pf.CLOSE_LAG.toFixed(1)} - aa), rf);
      stp = mix(stp, sm(-${STEEP_AHEAD.toFixed(1)}, 0.0, d2 - aa) * c2.w, rf);
      rp = mix(rp, sm(0.0, ${CURL_RAMP.toFixed(1)}, d2 - aa), rf); d = mix(d, d2, rf); }` : '';
  const capGlsl = pf.CURL_OUT < 1 ? `
    { float capA = ${inner ? `c3.z > 0.5 ? ${pf.CURL_OUT.toFixed(3)} : 1.0` : pf.CURL_OUT.toFixed(3)}; rp *= capA + (1.0 - capA) * ${inner ? 'rf' : '0.0'}; }` : '';
  // quanto da forma de tubo existe (quebra de fora cheia) — Arpoador: nada disso (1)
  const shp = pf.BARREL_OUT < 1 ? `mix(${inner ? `(c3.z > 0.5 ? ${pf.BARREL_OUT.toFixed(3)} : 1.0)` : pf.BARREL_OUT.toFixed(3)}, 1.0, ${inner ? 'rf' : '0.0'})` : '';
  // a linha da quebra de BASE: no Arpoador igual a antes (fecha em CLOSE_LAG_OUT, empina pela posição da quebra de fora)
  const baseGlsl = inner
    ? `vec4 c2 = uWc[i], c3 = uWd[i]; float rf = c2.z;
    float op = sm(0.0, ${pf.OPEN_EDGE.toFixed(1)}, d - aa), cl = sm(0.0, ${pf.CLOSE_EDGE.toFixed(1)}, d - c3.y - aa), stp = sm(-${STEEP_AHEAD.toFixed(1)}, 0.0, d - aa) * c3.x, rp = sm(0.0, ${CURL_RAMP.toFixed(1)}, d - aa);`
    : `float op = sm(0.0, ${pf.OPEN_EDGE.toFixed(1)}, d - aa), cl = sm(0.0, ${pf.CLOSE_EDGE.toFixed(1)}, d - ${pf.CLOSE_LAG_OUT.toFixed(1)} - aa), stp = sm(-${STEEP_AHEAD.toFixed(1)}, 0.0, d - aa) * sm(${(pf.BREAK_Q - 40).toFixed(1)}, ${(pf.BREAK_Q - 5).toFixed(1)}, a.x), rp = sm(0.0, ${CURL_RAMP.toFixed(1)}, d - aa);`;
  return /* glsl */ `
uniform vec4 uWa[${SLOTS}];   // qc, h, peelR, peelL
uniform vec4 uWb[${SLOTS}];   // hR, hL, ativa, vR (fase da ondulação da crista)${inner ? `
uniform vec4 uWc[${SLOTS}];   // peel2R, peel2L, reform, stB (próxima seção)
uniform vec4 uWd[${SLOTS}];   // stA, lagA, outer (seção de base)` : ''}
float gLipX, gLipK; // ponta do lip da onda que dobra (x em raios, peso) — a espuma do lip é feita por PIXEL
uniform vec2 uPeak, uQ, uS;
attribute vec2 aRest;
varying float vFoam;
varying float vCrest;
float sm(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
float bumpW(float x, float h, float st) {
  float w = x > 0.0 ? 3.4 - 1.4 * st : ${pf.BACK_W.toFixed(3)}; float r = x / w; float g = h * exp(-r * r);
  if (x <= 0.0 || st <= 0.0) return g;
  float u = min(1.0, x / ${FACE_W.toFixed(3)}); float cc = h * (1.0 - u) * (1.0 - u); // face côncava (igual a bump)
  return g + (cc - g) * st;
}
float tubeR(float h) { return clamp(h * ${TUBE.K.toFixed(3)}, ${TUBE.MIN.toFixed(3)}, ${TUBE.MAX.toFixed(3)}); }
const float BEND = ${pf.BEND.toFixed(3)}, BS = ${pf.BEND_S.toFixed(3)}, PB = ${PEAK_BLEND.toFixed(3)};
float bendQ(float s) { float k = min(1.0, abs(s) / BS); return BEND * k * k; } // igual a crestQ (surf-wave.ts)
// ponto da elipse do tubo com o ângulo corrigido (pontos por igual na curva) — igual ao P de barrelCurve (surf-wave.ts)
vec2 ellP(float ang, float r, float cq, float cy, float AX) { float a = ang + (AX - 1.0) / (2.0 * (AX + 1.0)) * sin(2.0 * ang); return vec2(cq + AX * r * cos(a), cy + r * sin(a)); }
float tubeAx(float R) { return ${TUBE.AX0.toFixed(3)} + ${TUBE.AXK.toFixed(3)} * R; }
float tubeAxAt(float R, float curl) { return tubeAx(R) * (0.65 + 0.35 * curl); } // igual a tubeAxAt (surf-wave.ts)
vec2 barrelCurve(float t, float R, float curl, float cl, float rs, float y0, float y1) {
  float wf = ${TUBE.WF.toFixed(3)} * R, wb = ${TUBE.WB.toFixed(3)} * R, Re = R * rs, T = Re * ${TUBE.LIP.toFixed(3)}, AX = tubeAxAt(R, curl);
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
vec3 curlOf(float op, float cl, float rp) { return vec3(rp, sm(0.0, 1.0, op) * (1.0 - sm(0.5, 1.0, cl)), 1.0 - 0.5 * cl); }
uniform vec2 uLim; // até onde a onda vai: x = direita, y = esquerda (morre na pedra)
float zoneFade(float s, float q) {
  float L = s >= 0.0 ? uLim.x : uLim.y;
  return sm(L, L - ${pf.EDGE_S.toFixed(1)}, abs(s)) * sm(${pf.Q_MIN.toFixed(1)}, ${(pf.Q_MIN + pf.EDGE_Q0).toFixed(1)}, q) * sm(${pf.Q_MAX.toFixed(1)}, ${(pf.Q_MAX - pf.EDGE_Q1).toFixed(1)}, q);
}
vec4 surfPoint(vec2 sq) {
  float s = sq.x, q0 = sq.y, fade = zoneFade(s, q0);
  float y = 0.0, foam = 0.0, fx = 0.0, fOpen = 0.0, fClosed = 0.0, fSteep = 0.0, fH = 0.0, fQc = 0.0, fRamp = 0.0${shp ? ', fShape = 1.0' : ''};
  gLipX = 0.0; gLipK = 0.0;
  bool fold = false;
  for (int i = 0; i < ${SLOTS}; i++) {
    vec4 a = uWa[i]; vec4 b = uWb[i];
    if (b.z < 0.5 || a.y <= 0.0) continue;
    float pk = sm(-PB, PB, s), d = mix(a.w, a.z, pk), aa = abs(s);
    ${baseGlsl}${innerGlsl}${capGlsl}
    float hs = a.y * mix(b.y, b.x, pk) * (1.0 + ${RIPPLE_A.toFixed(3)} * sin(${RIPPLE_K.toFixed(4)} * s + 7.0 * b.w)) * (1.0 - ${SHOULDER_DROP.toFixed(3)} * sm(${SHOULDER_HOLD.toFixed(1)}, ${(SHOULDER_HOLD + SHOULDER_LEN).toFixed(1)}, aa - d)), x = q0 - a.x - bendQ(s), R = tubeR(hs), wf = ${TUBE.WF.toFixed(3)} * R, wb = ${TUBE.WB.toFixed(3)} * R;
    y += bumpW(x, hs * (1.0 - ${pf.CLOSED_DROP.toFixed(3)} * cl), stp);
    if (curlOf(op, cl, rp).y${shp ? ' * ' + shp : ''} > 0.001 && x <= wf && x >= -wb) { fold = true; fx = x; fOpen = op; fClosed = cl; fSteep = stp; fH = hs; fQc = a.x + bendQ(s); fRamp = rp; gLipX = x / R; gLipK = op * (1.0 - cl)${shp ? ' * ' + shp : ''};${shp ? ' fShape = ' + shp + ';' : ''} }
    float r1 = (x + 1.0) / 5.0;
    foam = max(foam, cl * exp(-r1 * r1)); // espuma de depois de fechar (larga, suave); a do lip vai pro pixel
  }
  float q = q0;
  if (fold) {
    float R = tubeR(fH), wf = ${TUBE.WF.toFixed(3)} * R, wb = ${TUBE.WB.toFixed(3)} * R, hh = fH * (1.0 - ${pf.CLOSED_DROP.toFixed(3)} * fClosed);
    vec3 cu = curlOf(fOpen, fClosed, fRamp);${shp ? '\n    cu.y *= fShape;' : ''}
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
}

function surfMaterial(uniforms: Record<string, THREE.IUniform>, pf: SurfProfile): THREE.MeshStandardMaterial {
  const GLSL = surfGlsl(pf);
  // MESMO visual do mar em volta (cor, transparência, ondulação, relógio): sem retângulo de outra cor na zona
  const m = new THREE.MeshStandardMaterial({ ...ZS_WATER_LOOK, transparent: true, side: THREE.DoubleSide });
  // os dois lados numa passada SÓ (o three desenha transparente dos 2 lados em 2 passadas = a malha 2× por quadro).
  // A frente dos triângulos é o lado do ar (a ordem interna quase não aparece) — metade do custo (Pedro: "fluido").
  m.forceSinglePass = true;
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
  diffuseColor.a = mix(diffuseColor.a, 0.97, smoothstep(0.0, 0.6, vCrest));
  // espuma branca só na ponta do lip (calculada POR PIXEL — borda lisa, sem "degraus" da malha) e depois de fechar
  float lr = (vLipX + ${LIP_FOAM_X.toFixed(3)}) / ${LIP_FOAM_W.toFixed(3)};
  float fo = clamp(max(vFoam, vLipK * exp(-lr * lr) * 0.7) * 1.25, 0.0, 0.92);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.96, 0.97), fo);
  diffuseColor.a = mix(diffuseColor.a, 1.0, fo);`);
  };
  m.customProgramCacheKey = () => 'zs-surf-v4-' + pf.id; // um programa por perfil (o shader de cada um é diferente)
  return m;
}

/** Desenha a onda até esta distância (m) do pico — o Arpoador como antes. */
export function SurfBreak({ t, shoreX, shoreZ, pf = ARPOADOR, frameOf, enabled = true, rule = SERIES, mesh = ARPOADOR_MESH, seed = 20261028, drawDist = SURF_DRAW_DIST }: {
  t: ZsTerrain; shoreX: number; shoreZ: number; pf?: SurfProfile;
  /** onde fica o pico (padrão: o achador do Arpoador perto de shoreX/shoreZ) */
  frameOf?: (t: ZsTerrain) => SurfFrame | null;
  /** desligado (Sorriso fora da ressaca): sem série nova — as que vinham terminam */
  enabled?: boolean; rule?: SeriesRule; mesh?: SurfMeshRule; seed?: number; drawDist?: number;
}) {
  const frame = useMemo(() => (frameOf ? frameOf(t) : findSurfFrame(t, shoreX, shoreZ)), [t, shoreX, shoreZ, frameOf]);
  const scheduler = useMemo(() => new SurfScheduler(seed, pf, rule), [seed, pf, rule]);
  scheduler.enabled = enabled;
  const mobile = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
  const geometry = useMemo(() => buildSurfGeometry(mobile, frame?.lim ?? FULL, pf, mesh), [mobile, frame, pf, mesh]);
  const uniforms = useMemo(() => ({
    uWa: { value: Array.from({ length: SLOTS }, () => new THREE.Vector4()) },
    uWb: { value: Array.from({ length: SLOTS }, () => new THREE.Vector4()) },
    uWc: { value: Array.from({ length: SLOTS }, () => new THREE.Vector4()) },
    uWd: { value: Array.from({ length: SLOTS }, () => new THREE.Vector4()) },
    uPeak: { value: new THREE.Vector2() }, uQ: { value: new THREE.Vector2() }, uS: { value: new THREE.Vector2() }, uLim: { value: new THREE.Vector2(pf.ZONE_S, pf.ZONE_S) },
  }), [pf]);
  const material = useMemo(() => surfMaterial(uniforms, pf), [uniforms, pf]);
  const zoneRef = useRef<SurfZoneInfo | null>(null);

  useEffect(() => {
    if (!frame) return;
    uniforms.uPeak.value.set(frame.px, frame.pz); uniforms.uQ.value.set(frame.qx, frame.qz); uniforms.uS.value.set(frame.sx, frame.sz); uniforms.uLim.value.set(frame.lim[0], frame.lim[1]);
    const zone: SurfZoneInfo = { id: pf.id, pf, frame, scheduler, drawn: false };
    zoneRef.current = zone;
    const unregister = registerSurfZone(zone);
    // só em desenvolvimento: testes de tela leem a agenda e a zona (o Arpoador continua em __zsSurf, como antes)
    if (import.meta.env.DEV) {
      const w = window as unknown as Record<string, unknown>;
      w[pf === ARPOADOR ? '__zsSurf' : '__zsSurf_' + pf.id] = { scheduler, frame };
    }
    // tecla J: próxima série NO PICO MAIS PERTO da câmera (com dois picos, só o seu)
    const key = (e: KeyboardEvent) => { if (e.code === 'KeyJ' && !e.repeat && nearestSurfZone(camAt.x, camAt.z) === zone) scheduler.trigger(); };
    window.addEventListener('keydown', key);
    return () => { unregister(); zoneRef.current = null; window.removeEventListener('keydown', key); };
  }, [frame, uniforms, scheduler, pf]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  const meshRef = useRef<THREE.Mesh>(null), wasDrawn = useRef(false);
  const camAt = useMemo(() => ({ x: 0, z: 0 }), []);
  useFrame((state, dt) => {
    scheduler.advance(dt);
    let any = false;
    for (let i = 0; i < SLOTS; i++) {
      const s = scheduler.states[i]!, v = scheduler.vars[i]!;
      uniforms.uWa.value[i]!.set(s.qc, s.h, s.peelR, s.peelL);
      uniforms.uWb.value[i]!.set(v.hR, v.hL, s.active ? 1 : 0, v.vR);
      uniforms.uWc.value[i]!.set(s.peel2R ?? 0, s.peel2L ?? 0, s.reform ?? 0, s.stB ?? 0);
      uniforms.uWd.value[i]!.set(s.stA ?? 0, s.lagA ?? pf.CLOSE_LAG_OUT, s.outer ?? 1, 0);
      if (s.active) any = true;
    }
    // só desenha a malha da onda PERTO e COM ONDA (calmaria = mar liso igual ao de volta; longe não se vê) — o mar em
    // volta para de abrir o buraco junto (zone.drawn), então não aparece emenda. A física (CPU) segue igual.
    const cam = state.camera.position; camAt.x = cam.x; camAt.z = cam.z;
    const near = frame ? Math.hypot(cam.x - frame.px, cam.z - frame.pz) < drawDist : false;
    const drawn = any && near;
    if (zoneRef.current) zoneRef.current.drawn = drawn;
    // segura 1 quadro a mais ao esconder: o mar lê o aviso no quadro seguinte (sem piscar buraco)
    if (meshRef.current) meshRef.current.visible = drawn || wasDrawn.current;
    wasDrawn.current = drawn;
  });
  if (!frame) return null;
  return <mesh ref={meshRef} geometry={geometry} material={material} frustumCulled={false} renderOrder={2} receiveShadow />;
}
