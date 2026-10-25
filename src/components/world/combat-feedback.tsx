/**
 * Eco visual do combate: números de dano flutuantes e explosão de sangue.
 *
 * Fonte: `feedback: FeedbackEvent[]` na store (efêmero, escrito por
 * `reportDamage`). O componente NÃO usa seletor: lê `getState().feedback` no
 * laço de quadro e só varre o array quando a identidade dele muda.
 *
 * Tudo reaproveitado, nada de alocação por golpe:
 *  - números: pool fixo de `NUMBER_POOL` sprites, cada um com seu canvas de
 *    128x64 redesenhado no spawn (evento, não por quadro); anel circular,
 *    o mais antigo é reciclado quando o pool lota;
 *  - sangue: UM `InstancedMesh` de `PARTICLE_POOL` cubinhos (1 draw call),
 *    estado em `Float32Array`, também em anel; a cor sai de `instanceColor`.
 *  - MANCHAS no chão (25/10, ideia do mod "3D Blood VFX"): UM `InstancedMesh` de `DECAL_POOL` discos
 *    (1 draw call), em anel; somem encolhendo. O jato sai NA DIREÇÃO do golpe e tudo usa o chão REAL do
 *    mapa (antes: relevo procedural antigo → gotas nasciam/caíam fora do chão e quase não se viam).
 * Número e partícula têm teto fixo, então um combate caótico nunca cresce.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/game/state/game-store';
import type { FeedbackEvent } from '@/game/types/feedback';
import { markImpact, pixelsPerUnit, terrainHeight } from './world-kit';
import { glbSurfaceY } from './terrain-collision';
import { triggerHitStop } from './hit-stop';

const NUMBER_POOL = 18;
const PARTICLE_POOL = 120;
const DECAL_POOL = 40;
/** Mancha no chão: dura isso (s) e encolhe no último DECAL_FADE s (Pedro 25/10: 8 s → 3 s). */
const DECAL_LIFE = 3;
const DECAL_FADE = 1;
const PF = 10; // floats por partícula: x,y,z,vx,vy,vz,born,life,size,chão
const GRAVITY = 13;

type NumberSlot = {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  tex: THREE.CanvasTexture;
  ctx: CanvasRenderingContext2D | null;
  canvas: HTMLCanvasElement;
  active: boolean;
  born: number;
  life: number;
  x: number;
  y: number;
  z: number;
  scale: number;
};

function makeNumberSlot(): NumberSlot {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  const sprite = new THREE.Sprite(mat);
  sprite.visible = false;
  sprite.renderOrder = 20;
  sprite.raycast = () => {};
  return {
    sprite, mat, tex, canvas, ctx: canvas.getContext('2d'),
    active: false, born: 0, life: 1, x: 0, y: 0, z: 0, scale: 1,
  };
}

function drawNumber(slot: NumberSlot, text: string, color: string) {
  const ctx = slot.ctx;
  if (!ctx) return;
  ctx.clearRect(0, 0, 128, 64);
  ctx.font = '800 40px Manrope, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(14,6,4,0.9)';
  ctx.strokeText(text, 64, 34);
  ctx.fillStyle = color;
  ctx.fillText(text, 64, 34);
  slot.tex.needsUpdate = true;
}

const BLOOD = ['#b3261e', '#8f1a14', '#d9412f', '#a31d17'].map(c => new THREE.Color(c));
const FIRE = ['#ff8a1e', '#ff5a00', '#ffc233', '#ff3b00'].map(c => new THREE.Color(c));
const SPARK = new THREE.Color('#ffd34a');
const dummy = new THREE.Object3D();

export function CombatFeedback() {
  const slots = useMemo(() => Array.from({ length: NUMBER_POOL }, makeNumberSlot), []);

  const partGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const partMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }), []);
  const partMesh = useRef<THREE.InstancedMesh>(null);
  const parts = useRef(new Float32Array(PARTICLE_POOL * PF));
  // Manchas: x,y,z,born,size,rot (6 floats) + ativa
  const decalGeo = useMemo(() => new THREE.CircleGeometry(0.5, 14).rotateX(-Math.PI / 2), []);
  const decalMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#5a0d08', transparent: true, opacity: 0.78, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false }), []);
  const decalMesh = useRef<THREE.InstancedMesh>(null);
  const decals = useRef(new Float32Array(DECAL_POOL * 6));
  const decalActive = useRef(new Uint8Array(DECAL_POOL));
  const decalNext = useRef(0);
  const partActive = useRef(new Uint8Array(PARTICLE_POOL));
  const partNext = useRef(0);
  const numNext = useRef(0);
  const now = useRef(0);
  const lastArr = useRef<unknown>(null);
  const seen = useRef(new Set<number>());

  useEffect(() => () => {
    for (const s of slots) { s.tex.dispose(); s.mat.dispose(); }
    partGeo.dispose();
    partMat.dispose();
    decalGeo.dispose();
    decalMat.dispose();
  }, [slots, partGeo, partMat, decalGeo, decalMat]);

  // Esconde todas as instâncias de partículas até haver o que mostrar.
  useEffect(() => {
    const m = partMesh.current;
    if (!m) return;
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    for (let i = 0; i < PARTICLE_POOL; i++) {
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, BLOOD[0]!);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    const d = decalMesh.current;
    if (d) { for (let i = 0; i < DECAL_POOL; i++) d.setMatrixAt(i, dummy.matrix); d.instanceMatrix.needsUpdate = true; }
  }, []);

  const placeDecal = (x: number, y: number, z: number, size: number) => {
    const d = decalMesh.current;
    if (!d) return;
    const i = decalNext.current;
    decalNext.current = (i + 1) % DECAL_POOL;
    const o = i * 6, arr = decals.current;
    arr[o] = x; arr[o + 1] = y + 0.03; arr[o + 2] = z; arr[o + 3] = now.current; arr[o + 4] = size; arr[o + 5] = Math.random() * Math.PI;
    decalActive.current[i] = 1;
    dummy.position.set(x, y + 0.03, z); dummy.rotation.set(0, arr[o + 5]!, 0); dummy.scale.set(size, 1, size * (0.6 + Math.random() * 0.4));
    dummy.updateMatrix();
    d.setMatrixAt(i, dummy.matrix);
    d.instanceMatrix.needsUpdate = true;
  };

  const spawnNumber = (ev: FeedbackEvent) => {
    const slot = slots[numNext.current]!;
    numNext.current = (numNext.current + 1) % NUMBER_POOL;
    const heal = ev.kind === 'heal';
    const crit = !!ev.critical;
    const text = heal ? `+${ev.amount}` : crit ? `${ev.amount}!` : `${ev.amount}`;
    const color = heal
      ? '#8fe388'
      : ev.fire
        ? (crit ? '#ffb03a' : '#ff8a2a')
        : ev.onPlayer
          ? (crit ? '#ff3a2a' : '#ff6a58')
          : (crit ? '#ffe27a' : '#fff3d0');
    drawNumber(slot, text, color);
    slot.active = true;
    slot.born = now.current;
    slot.life = THREE.MathUtils.clamp(ev.ttl / 1000, 0.7, 1.8);
    slot.x = ev.position.x + (Math.random() - 0.5) * 0.5;
    slot.z = ev.position.z + (Math.random() - 0.5) * 0.5;
    slot.y = terrainHeight(ev.position.x, ev.position.z) + (ev.onPlayer ? 2.1 : 1.6);
    slot.scale = crit ? 1.55 : 1;
    slot.sprite.visible = true;
  };

  const spawnBurst = (ev: FeedbackEvent) => {
    const m = partMesh.current;
    if (!m) return;
    const isDeath = ev.kind === 'death';
    const palette = ev.fire ? FIRE : BLOOD;
    const n = isDeath ? 24 : ev.critical ? 18 : 12;
    // Chão REAL do mapa, calculado 1× por golpe (as gotas andam < 2 m — não precisa por gota).
    const ground = glbSurfaceY(ev.position.x, ev.position.z, terrainHeight(ev.position.x, ev.position.z));
    const baseY = ground + (ev.onPlayer ? 1.1 : 0.8);
    // Jato pra LONGE de quem bateu (o herói, quando o golpe é num bicho).
    const me = useGameStore.getState().player.position;
    let dx = ev.position.x - me.x, dz = ev.position.z - me.z;
    const dl = Math.hypot(dx, dz);
    if (ev.onPlayer || dl < 0.2) { dx = 0; dz = 0; } else { dx /= dl; dz /= dl; }
    const arr = parts.current;
    for (let k = 0; k < n; k++) {
      const i = partNext.current;
      partNext.current = (i + 1) % PARTICLE_POOL;
      const o = i * PF;
      const a = Math.random() * Math.PI * 2;
      const sp = 1.6 + Math.random() * (ev.critical || isDeath ? 4.4 : 3);
      arr[o] = ev.position.x;
      arr[o + 1] = baseY;
      arr[o + 2] = ev.position.z;
      arr[o + 3] = Math.cos(a) * sp * 0.55 + dx * sp * 0.9;
      arr[o + 4] = 1.5 + Math.random() * 3.2;
      arr[o + 5] = Math.sin(a) * sp * 0.55 + dz * sp * 0.9;
      arr[o + 6] = now.current;
      arr[o + 7] = 0.55 + Math.random() * 0.5;
      arr[o + 8] = 0.08 + Math.random() * 0.12;
      arr[o + 9] = ground + 0.04;
      partActive.current[i] = 1;
      const spark = ev.critical && k % 4 === 0;
      m.setColorAt(i, spark ? SPARK : palette[k % palette.length]!);
    }
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    // Manchas no chão (fogo não sangra): 1 no golpe, 3 na morte, jogadas no sentido do jato.
    if (!ev.fire) {
      const k = isDeath ? 3 : ev.critical ? 2 : 1;
      for (let j = 0; j < k; j++) {
        const r = 0.3 + Math.random() * 0.9;
        placeDecal(ev.position.x + dx * r + (Math.random() - 0.5) * 0.5, ground, ev.position.z + dz * r + (Math.random() - 0.5) * 0.5,
          (isDeath ? 1.1 : 0.55) * (0.7 + Math.random() * 0.6));
      }
    }
  };

  useFrame((state, delta) => {
    now.current += delta;
    const t = now.current;

    // --- eventos novos ---
    const fb = (useGameStore.getState() as unknown as { feedback?: FeedbackEvent[] }).feedback;
    if (fb && fb !== lastArr.current) {
      lastArr.current = fb;
      const seenIds = seen.current;
      for (let i = 0; i < fb.length; i++) {
        const ev = fb[i]!;
        if (seenIds.has(ev.id)) continue;
        seenIds.add(ev.id);
        if (ev.kind === 'damage' || ev.kind === 'heal') spawnNumber(ev);
        if (ev.kind === 'damage' || ev.kind === 'death') spawnBurst(ev);
        // Soco de impacto → a câmera tremula (peso do golpe).
        // Hit stop: crítico ou abate (nunca no golpe que EU tomo — não trava quem está apanhando).
        if (ev.kind === 'death' || (ev.kind === 'damage' && ev.critical && !ev.onPlayer)) triggerHitStop();
        if (ev.kind === 'death') markImpact(1.6);
        else if (ev.kind === 'damage') markImpact(ev.onPlayer ? 0.7 : ev.critical ? 1.4 : 1.0);
      }
      if (seenIds.size > 400) {
        const live = new Set(fb.map(e => e.id));
        for (const id of seenIds) if (!live.has(id)) seenIds.delete(id);
      }
    }

    // --- números ---
    const cam = state.camera;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i]!;
      if (!s.active) continue;
      const u = (t - s.born) / s.life;
      if (u >= 1) { s.active = false; s.sprite.visible = false; continue; }
      const rise = 1.3 * (1 - (1 - u) * (1 - u));
      s.sprite.position.set(s.x, s.y + rise, s.z);
      const pop = u < 0.14 ? 0.6 + (u / 0.14) * 0.6 : u < 0.26 ? 1.2 - ((u - 0.14) / 0.12) * 0.2 : 1;
      const dist = cam.position.distanceTo(s.sprite.position);
      const ppu = pixelsPerUnit(cam, state.size.height, dist);
      // 64 px de altura de sprite = tamanho legível nas duas câmeras.
      const h = THREE.MathUtils.clamp((64 * s.scale * pop) / ppu, 0.35, 4);
      s.sprite.scale.set(h * 2, h, 1);
      s.mat.opacity = u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4;
    }

    // --- partículas ---
    const m = partMesh.current;
    if (!m) return;
    const arr = parts.current;
    const act = partActive.current;
    let any = false;
    for (let i = 0; i < PARTICLE_POOL; i++) {
      if (!act[i]) continue;
      const o = i * PF;
      const age = t - arr[o + 6]!;
      const life = arr[o + 7]!;
      if (age >= life) {
        act[i] = 0;
        dummy.scale.setScalar(0);
        dummy.position.set(0, -50, 0);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
        any = true;
        continue;
      }
      const dt = Math.min(delta, 0.05);
      arr[o + 4] = arr[o + 4]! - GRAVITY * dt;
      arr[o] = arr[o]! + arr[o + 3]! * dt;
      arr[o + 1] = arr[o + 1]! + arr[o + 4]! * dt;
      arr[o + 2] = arr[o + 2]! + arr[o + 5]! * dt;
      const ground = arr[o + 9]!;
      if (arr[o + 1]! < ground) {
        arr[o + 1] = ground;
        arr[o + 3] = arr[o + 5] = 0;
        arr[o + 4] = 0;
      }
      const k = 1 - age / life;
      dummy.position.set(arr[o]!, arr[o + 1]!, arr[o + 2]!);
      dummy.scale.setScalar(arr[o + 8]! * (0.35 + 0.65 * k));
      dummy.rotation.set(age * 7, age * 5, 0);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      any = true;
    }
    if (any) m.instanceMatrix.needsUpdate = true;

    // --- manchas: só mexe nas que estão sumindo (encolhem no fim) ---
    const d = decalMesh.current;
    if (d) {
      const da = decals.current, dact = decalActive.current;
      let touched = false;
      for (let i = 0; i < DECAL_POOL; i++) {
        if (!dact[i]) continue;
        const o = i * 6, age = t - da[o + 3]!;
        if (age < DECAL_LIFE - DECAL_FADE) continue;
        const k = Math.max(0, (DECAL_LIFE - age) / DECAL_FADE);
        if (k <= 0) dact[i] = 0;
        dummy.position.set(da[o]!, k <= 0 ? -50 : da[o + 1]!, da[o + 2]!);
        dummy.rotation.set(0, da[o + 5]!, 0);
        dummy.scale.set(da[o + 4]! * k, 1, da[o + 4]! * k * 0.8);
        dummy.updateMatrix();
        d.setMatrixAt(i, dummy.matrix);
        touched = true;
      }
      if (touched) d.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
      {slots.map((s, i) => <primitive key={i} object={s.sprite} />)}
      <instancedMesh ref={decalMesh} args={[decalGeo, decalMat, DECAL_POOL]} frustumCulled={false} raycast={() => {}} renderOrder={1} />
      <instancedMesh
        ref={partMesh}
        args={[partGeo, partMat, PARTICLE_POOL]}
        frustumCulled={false}
        raycast={() => {}}
      />
    </>
  );
}
