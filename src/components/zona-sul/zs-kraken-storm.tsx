/**
 * TEMPESTADE DO KRAKEN (04/11, Pedro: "o que mais dá pra deixar mais cinematográfico sem perder FPS: ventos? raios? nuvem?").
 * Desenho da nuvem em espiral em cima dele + os raios caindo no mar em volta. As regras (quando, onde, o clarão) são
 * puras em `zs-omen.ts`. Aparece junto com o céu de fim de tarde (`zsOmen.k`) — de cada jogador, pela distância dele.
 *  - nuvem: 2 discos transparentes (MeshBasic, textura feita 1× aqui) — nenhum shader novo;
 *  - raio: 1 fita de frente pra câmera (~40 vértices), refeita só quando cai; o clarão vai pro `zsOmen.flash`.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { zsKraken } from './zs-kraken-boss';
import { boltPath, boltSpot, flashAt, nextBoltIn, STORM, zsOmen } from './zs-omen';
import { zsWaterYAt } from './zs-terrain-data';
import { touchLayout } from '@/components/world/virtual-input';

/** Ruído de valor (hash) — só pra pintar a textura da nuvem uma vez. */
function hash(i: number, j: number): number {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x: number, y: number): number {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Textura da nuvem: espiral escura (torcida como o redemoinho), olho no meio, borda some. 256² (~5 ms, 1×). */
function makeCloudTexture(): THREE.CanvasTexture {
  const N = 256, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!, img = g.createImageData(N, N);
  for (let py = 0; py < N; py++) {
    for (let px = 0; px < N; px++) {
      const x = (px + 0.5) / N * 2 - 1, y = (py + 0.5) / N * 2 - 1, r = Math.hypot(x, y);
      const o = (py * N + px) * 4;
      if (r >= 1) { img.data[o + 3] = 0; continue; }
      const th = Math.atan2(y, x) + r * 5.5; // torce em espiral
      const sx = Math.cos(th) * r * 4, sy = Math.sin(th) * r * 4;
      let n = 0, amp = 0.55, f = 1;
      for (let k = 0; k < 4; k++) { n += vnoise(sx * f + 7, sy * f + 3) * amp; amp *= 0.5; f *= 2.1; }
      const edge = r < 0.62 ? 1 : Math.max(0, 1 - (r - 0.62) / 0.38);
      const eye = Math.min(1, Math.max(0, (r - 0.035) / 0.1));
      const a = Math.max(0, Math.min(1, n * 1.7 - 0.28)) * edge * edge * eye;
      const lum = 26 + n * 46; // escuro, com os topos mais claros
      img.data[o] = lum * 1.0; img.data[o + 1] = lum * 0.86; img.data[o + 2] = lum * 1.08; img.data[o + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Corte do raio (de um lado ao outro da fita): miolo fino branco, borda lilás suave (aditivo). */
function makeBoltTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 64; c.height = 4;
  const g = c.getContext('2d')!, gr = g.createLinearGradient(0, 0, 64, 0);
  gr.addColorStop(0, 'rgba(150,130,255,0)'); gr.addColorStop(0.32, 'rgba(170,150,255,0.35)'); gr.addColorStop(0.47, 'rgba(255,255,255,1)');
  gr.addColorStop(0.53, 'rgba(255,255,255,1)'); gr.addColorStop(0.68, 'rgba(170,150,255,0.35)'); gr.addColorStop(1, 'rgba(150,130,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const CLOUD_DARK = new THREE.Color('#ffffff'), CLOUD_LIT = new THREE.Color('#ffffff').multiplyScalar(4.2);
const MAIN_PTS = STORM.BOLT_SEGS + 1, BRANCH_SEGS = 5, BRANCH_PTS = BRANCH_SEGS + 1;

export function ZsKrakenStorm() {
  const parts = useMemo(() => {
    const tex = makeCloudTexture();
    const mk = (r: number, opacity: number) => {
      // CÚPULA (não disco chato — de longe o disco parecia disco voador): o centro no alto, a borda desce STORM.CLOUD_DROP
      // (o anel tem divisões no raio pra poder curvar; o UV é o mesmo do disco)
      const geo = new THREE.RingGeometry(0.5, r, 48, 8), pos = geo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) { const q = Math.hypot(pos.getX(i), pos.getY(i)) / r; pos.setZ(i, STORM.CLOUD_DROP * (r / STORM.CLOUD_R) * q * q); }
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity, color: CLOUD_DARK.clone() }));
      m.rotation.x = Math.PI / 2; m.renderOrder = 1; m.frustumCulled = false;
      return m;
    };
    const top = mk(STORM.CLOUD_R, 0.95), low = mk(STORM.CLOUD_R * 0.72, 0.7);
    low.position.y = -32;
    const cloud = new THREE.Group(); cloud.add(top, low); cloud.visible = false;
    // RAIO: fita principal + 1 galho, de frente pra câmera (posições refeitas quando cai)
    const verts = (MAIN_PTS + BRANCH_PTS) * 2;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3).setUsage(THREE.DynamicDrawUsage));
    // u = de um lado ao outro da fita (0 / 1) — a textura faz o miolo e a borda
    const uv = new Float32Array(verts * 2);
    for (let i = 0; i < verts; i++) { uv[i * 2] = i % 2; uv[i * 2 + 1] = 0.5; }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const boltTex = makeBoltTexture();
    const idx: number[] = [];
    const strip = (start: number, pts: number) => { for (let i = 0; i < pts - 1; i++) { const a = start + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } };
    strip(0, MAIN_PTS); strip(MAIN_PTS * 2, BRANCH_PTS);
    geo.setIndex(idx);
    const bolt = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: boltTex, color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }));
    bolt.frustumCulled = false; bolt.visible = false; bolt.renderOrder = 6;
    return { tex, boltTex, cloud, top, low, bolt, geo };
  }, []);
  const st = useRef({ next: 2, age: 99, spin: 0 });
  const tmp = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), d: new THREE.Vector3(), v: new THREE.Vector3(), s: new THREE.Vector3() }), []);
  useEffect(() => () => {
    parts.tex.dispose(); parts.boltTex.dispose(); parts.geo.dispose(); (parts.bolt.material as THREE.Material).dispose();
    for (const m of [parts.top, parts.low]) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    zsOmen.flash = 0;
  }, [parts]);

  /** Escreve uma fita de frente pra câmera pelos pontos (largura w). */
  const ribbon = (pos: THREE.BufferAttribute, start: number, pts: [number, number, number][], w: number, cam: THREE.Vector3) => {
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!, q = pts[Math.min(pts.length - 1, i + 1)]!, pr = pts[Math.max(0, i - 1)]!;
      tmp.d.set(q[0] - pr[0], q[1] - pr[1], q[2] - pr[2]).normalize();
      tmp.v.set(cam.x - p[0], cam.y - p[1], cam.z - p[2]).normalize();
      tmp.s.crossVectors(tmp.d, tmp.v).normalize().multiplyScalar(w * (1 - 0.45 * (i / (pts.length - 1))) / 2);
      pos.setXYZ(start + i * 2, p[0] - tmp.s.x, p[1] - tmp.s.y, p[2] - tmp.s.z);
      pos.setXYZ(start + i * 2 + 1, p[0] + tmp.s.x, p[1] + tmp.s.y, p[2] + tmp.s.z);
    }
  };

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1), K = zsKraken.s, k = zsOmen.k, S = st.current;
    const show = k > 0.01;
    parts.cloud.visible = show;
    parts.low.visible = !touchLayout.on; // celular: só a camada de cima (camada transparente grande pesa mais lá)
    if (!show) { parts.bolt.visible = false; zsOmen.flash = 0; S.age = 99; return; }
    const kk = k * k * (3 - 2 * k), waterY = zsWaterYAt(K.x, K.z);
    // NUVEM: em cima dele, girando (as 2 camadas em sentidos contrários)
    S.spin += dt * STORM.CLOUD_SPIN;
    parts.cloud.position.set(K.x, waterY + STORM.CLOUD_Y, K.z);
    parts.top.rotation.z = S.spin; parts.low.rotation.z = -S.spin * 1.6;
    // RAIO: sorteia o próximo; o clarão acende tudo por 0,45 s
    S.age += dt; S.next -= dt;
    if (S.next <= 0) {
      S.next = nextBoltIn(Math.random());
      if (k >= STORM.MIN_K) {
        S.age = 0;
        const at = boltSpot(K.x, K.z, Math.random(), Math.random());
        const yTop = waterY + STORM.CLOUD_Y - 20, yBot = zsWaterYAt(at.x, at.z);
        const main = boltPath(Math.random, at.x, at.z, yTop, yBot);
        // galho: sai de ~35–55% da altura e desce 1/3 pro lado
        const from = main[Math.floor(STORM.BOLT_SEGS * (0.35 + Math.random() * 0.2))]!;
        const ang = Math.random() * Math.PI * 2, len = (yTop - yBot) * 0.3;
        const branch = boltPath(Math.random, from[0] + Math.sin(ang) * len * 0.6, from[2] + Math.cos(ang) * len * 0.6, from[1], from[1] - len, BRANCH_SEGS);
        branch[0] = [from[0], from[1], from[2]];
        const pos = parts.geo.getAttribute('position') as THREE.BufferAttribute, cam = state.camera.position;
        ribbon(pos, 0, main, STORM.BOLT_W, cam);
        ribbon(pos, MAIN_PTS * 2, branch, STORM.BOLT_W * 0.5, cam);
        pos.needsUpdate = true;
      }
    }
    const fl = flashAt(S.age) * kk;
    zsOmen.flash = fl;
    parts.bolt.visible = fl > 0.02;
    (parts.bolt.material as THREE.MeshBasicMaterial).opacity = Math.min(1, fl * 1.4);
    // a nuvem acende no clarão (por dentro)
    for (const m of [parts.top, parts.low]) {
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.color.copy(CLOUD_DARK).lerp(CLOUD_LIT, fl);
    }
    (parts.top.material as THREE.MeshBasicMaterial).opacity = 0.95 * kk;
    (parts.low.material as THREE.MeshBasicMaterial).opacity = 0.7 * kk;
  });
  return (
    <>
      <primitive object={parts.cloud} />
      <primitive object={parts.bolt} />
    </>
  );
}
