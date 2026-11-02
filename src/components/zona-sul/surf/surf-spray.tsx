/**
 * ESPIRRO DA ONDA (02/11, Pedro item 4: "espirro de água na crista da onda"). Como na onda de verdade, dois:
 *  - NÉVOA DA CRISTA: a parede em pé (empinando, ainda sem fechar) solta um véu fino do topo que o vento terral joga
 *    pra TRÁS (pro mar) e pra cima;
 *  - EXPLOSÃO: onde o lip cai e a onda está FECHANDO, a água estoura pra cima e pra frente (rumo à praia).
 * A conta da onda é a MESMA do shader/física (surf-wave.ts): a gota nasce exatamente na crista/na queda do lip.
 * LEVE: um desenho só (pontos), até SPRAY.N gotas (celular metade); só liga com a malha da onda desenhada e a câmera a
 * menos de SPRAY.DIST m do pico. Nada de física de jogo: é só visual.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { nightFactor } from '@/game/systems/dayNightSystem';
import { barrelAt, barrelBand, crestQ, type Lim, smooth, type SurfProfile, surfHeightAt, type WaveState, type WaveVar, zoneFade } from './surf-wave';
import type { SurfFrame } from './surf-frame';
import type { SurfZoneInfo } from './surf-zones';

export const SPRAY = {
  /** gotas no máximo (celular: N_MOBILE) — pontos num desenho só */ N: 720, N_MOBILE: 280,
  /** tentativas de nascer por segundo (cada uma que pega solta um CACHO de CLUSTER gotas; celular: RATE_MOBILE) */
  RATE: 260, RATE_MOBILE: 100, CLUSTER: 3,
  /** liga só com a câmera a menos disto do pico (m) */ DIST: 260,
  /** vida (s) */ LIFE: [0.7, 1.3] as const,
  /** a gota cai mais devagar que pedra (névoa freia no ar) */ G: 6, DRAG: 1.2,
} as const;

/** Quanto este ponto da onda espirra: névoa da crista (parede em pé, antes de fechar) e explosão (fechando). 0..1. */
export function sprayWeights(s: number, w: WaveState, v: WaveVar, pf: SurfProfile): { crest: number; burst: number; hSide: number; r: number } {
  if (!w.active || w.h <= 0) return { crest: 0, burst: 0, hSide: 0, r: 0 };
  const b = barrelAt(s, w, v, pf), big = smooth(0.6, 2.2, b.hSide);
  return {
    crest: b.steep * (1 - b.closed) * big,
    // mais forte no MEIO do fechamento; ×2,5 (teto 1): a faixa que fecha é curta (~7 m) e a explosão é o que mais aparece
    burst: Math.min(1, 10 * b.closed * (1 - b.closed) * Math.max(b.open, b.closed)) * big,
    hSide: b.hSide, r: barrelBand(b.hSide).r,
  };
}

type Drop = { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; a0: number };

/** Nasce uma gota (ou nenhuma) numa coluna sorteada da onda. Puro com `rnd` (testável). */
export function sprayEmit(states: WaveState[], vars: WaveVar[], frame: SurfFrame, pf: SurfProfile, rnd: () => number, out: Drop): boolean {
  const lim: Lim = frame.lim;
  const act: number[] = [];
  for (let i = 0; i < states.length; i++) if (states[i]!.active && states[i]!.h > 0) act.push(i);
  if (!act.length) return false;
  for (let tries = 0; tries < 6; tries++) {
    const i = act[Math.floor(rnd() * act.length)]!, w = states[i]!, v = vars[i]!;
    // onde está a AÇÃO (de um lado ou do outro): 35% em volta da LINHA QUE FECHA (CLOSE_LAG atrás da abertura — a
    // explosão), 30% entre a frente que abre o tubo (+6 m) e essa linha (o lip jogando); o resto em qualquer ponto da
    // crista (a névoa da parede em pé)
    let s: number;
    const r0 = rnd();
    if (r0 < 0.65) {
      const side = rnd() < 0.5 ? 1 : -1, d0 = side > 0 ? w.peelR : w.peelL, lag = w.lagA ?? pf.CLOSE_LAG_OUT;
      s = side * Math.max(0, r0 < 0.35 ? d0 - lag - 4 + rnd() * 10 : d0 + 6 - rnd() * (lag + 14));
      if (s > lim[0] || s < -lim[1]) continue;
    } else s = -lim[1] + rnd() * (lim[0] + lim[1]);
    const k = sprayWeights(s, w, v, pf);
    // a névoa é um véu FINO (pouca gota, transparente); a explosão é água grossa
    const burst = rnd() < k.burst / Math.max(1e-6, k.burst + 0.3 * k.crest);
    const p = burst ? k.burst : 0.3 * k.crest;
    if (rnd() >= p) continue;
    // névoa: no TOPO da crista · explosão: na frente dela (onde o lip cai), até ~1,8R
    const q = crestQ(w, s, pf) + (burst ? rnd() * 1.8 * k.r : (rnd() - 0.5) * 0.6);
    const fade = zoneFade(s, q, lim, pf);
    if (rnd() >= fade) continue;
    const y = surfHeightAt(s, q, states, vars, Infinity, lim, pf);
    const sz = Math.sqrt(Math.max(0.3, k.hSide / 3));
    const up = burst ? (2.5 + rnd() * 3) * sz : (1.2 + rnd() * 2.2) * sz;
    const fwd = burst ? 0.5 + rnd() * 1.5 : -(1.8 + rnd() * 2.4) * sz; // + = praia; névoa vai pro mar (terral)
    const side = (rnd() - 0.5) * (burst ? 2 : 1);
    out.x = frame.px + frame.sx * s + frame.qx * q; out.z = frame.pz + frame.sz * s + frame.qz * q; out.y = y + 0.1;
    out.vx = frame.qx * fwd + frame.sx * side; out.vz = frame.qz * fwd + frame.sz * side; out.vy = up;
    out.max = out.life = SPRAY.LIFE[0] + rnd() * (SPRAY.LIFE[1] - SPRAY.LIFE[0]);
    // névoa = véu largo e ralo · explosão = água grossa
    out.size = burst ? 0.7 + rnd() * 0.7 : 0.45 + rnd() * 0.45;
    out.a0 = burst ? 0.85 : 0.5;
    return true;
  }
  return false;
}

const VERT = `
attribute float aAlpha;
attribute float aSize;
uniform float uScale;
varying float vAlpha;
void main() {
  vAlpha = aAlpha;
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * view;
  gl_PointSize = aAlpha > 0.0 ? clamp(aSize * uScale / max(1.0, -view.z), 1.0, 64.0) : 0.0;
}`;
const FRAG = `
uniform float uNight;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = (1.0 - smoothstep(0.12, 0.5, d)) * vAlpha;
  vec3 col = mix(vec3(0.93, 0.96, 0.98), vec3(0.16, 0.2, 0.26), uNight * 0.85);
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;

export function SurfSpray({ frame, pf, zoneRef, statesOf }: {
  frame: SurfFrame; pf: SurfProfile; zoneRef: { current: SurfZoneInfo | null };
  statesOf: () => { states: WaveState[]; vars: WaveVar[] };
}) {
  const mobile = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
  const N = mobile ? SPRAY.N_MOBILE : SPRAY.N, RATE = mobile ? SPRAY.RATE_MOBILE : SPRAY.RATE;
  const { geo, pos, alpha, size, drops, attrs } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3), alpha = new Float32Array(N), size = new Float32Array(N);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    const drops: Drop[] = Array.from({ length: N }, () => ({ x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 0, a0: 0 }));
    const attrs = [g.getAttribute('position'), g.getAttribute('aAlpha'), g.getAttribute('aSize')] as THREE.BufferAttribute[];
    return { geo: g, pos, alpha, size, drops, attrs };
  }, [N]);
  const uni = useMemo(() => ({ uScale: { value: 400 }, uNight: { value: 0 } }), []);
  const mat = useMemo(() => new THREE.ShaderMaterial({ uniforms: uni, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false }), [uni]);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  const ref = useRef<THREE.Points>(null), acc = useRef(0), alive = useRef(0), next = useRef(0);

  useFrame((state, delta) => {
    const pts = ref.current; if (!pts) return;
    const dt = Math.min(delta, 0.05), cam = state.camera.position;
    const on = !!zoneRef.current?.drawn && Math.hypot(cam.x - frame.px, cam.z - frame.pz) < SPRAY.DIST;
    if (!on && alive.current === 0) { pts.visible = false; return; }
    pts.visible = true;
    // nasce (só com a onda desenhada e perto)
    if (on) {
      const { states, vars } = statesOf();
      acc.current += RATE * dt;
      while (acc.current >= 1) {
        acc.current -= 1;
        const d = drops[next.current]!;
        if (d.life > 0) break; // todas vivas: espera (sem roubar gota no meio do voo)
        if (!sprayEmit(states, vars, frame, pf, Math.random, d)) continue;
        next.current = (next.current + 1) % N;
        // CACHO: mais gotas grudadas nesta (um lençol de água se abre, não uma gota sozinha)
        for (let c = 1; c < SPRAY.CLUSTER; c++) {
          const e = drops[next.current]!; if (e.life > 0) break;
          const j = () => 0.75 + Math.random() * 0.5;
          e.x = d.x + (Math.random() - 0.5) * 0.9; e.y = d.y + Math.random() * 0.3; e.z = d.z + (Math.random() - 0.5) * 0.9;
          e.vx = d.vx * j() + (Math.random() - 0.5) * 0.6; e.vy = d.vy * j(); e.vz = d.vz * j() + (Math.random() - 0.5) * 0.6;
          e.max = e.life = d.max * j(); e.size = d.size * (0.6 + Math.random() * 0.5); e.a0 = d.a0;
          next.current = (next.current + 1) % N;
        }
      }
    } else acc.current = 0;
    // voa
    const pc = state.camera as THREE.PerspectiveCamera;
    uni.uScale.value = (state.size.height * state.viewport.dpr * 0.5) / Math.tan(((pc.fov ?? 60) * Math.PI) / 360);
    uni.uNight.value = nightFactor();
    const damp = Math.exp(-SPRAY.DRAG * dt);
    let n = 0;
    for (let i = 0; i < N; i++) {
      const d = drops[i]!;
      if (d.life > 0) {
        d.life -= dt; d.vy -= SPRAY.G * dt; d.vx *= damp; d.vz *= damp; d.vy *= damp;
        d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
        if (d.y < -0.6) d.life = 0;
      }
      const k = d.life > 0 ? d.life / d.max : 0;
      pos[i * 3] = d.x; pos[i * 3 + 1] = d.y; pos[i * 3 + 2] = d.z;
      alpha[i] = k > 0 ? Math.min(1, k * 2.2) * d.a0 : 0;  // some no fim da vida
      size[i] = d.size * (1 + 0.9 * (1 - k));               // abre ao subir (vira névoa)
      if (k > 0) n++;
    }
    alive.current = n;
    for (const a of attrs) a.needsUpdate = true;
  });
  return <points ref={ref} geometry={geo} material={mat} frustumCulled={false} renderOrder={3} raycast={() => {}} />;
}
