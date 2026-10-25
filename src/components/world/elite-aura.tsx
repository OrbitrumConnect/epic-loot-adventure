import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/game/state/game-store';

/**
 * FUMAÇA VERMELHA do Enfurecido (Pedro 25/10: "sai uma fumaça vermelha dele"). Leve de propósito:
 * 5 baforadas (sprites) por bicho, UMA textura gerada 1× e compartilhada, sem sombra, e escondida a mais
 * de AURA_RANGE do jogador (não gasta pintura de tela à toa). Só é montada quando o bicho é Enfurecido.
 */
const PUFFS = 5;
const AURA_RANGE2 = 45 * 45;
const CYCLE = 1.6; // s de cada baforada (sobe e some)

let sharedTex: THREE.CanvasTexture | null = null;
function smokeTexture(): THREE.CanvasTexture {
  if (sharedTex) return sharedTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grad.addColorStop(0, 'rgba(255,60,40,0.85)');
    grad.addColorStop(0.45, 'rgba(190,20,15,0.45)');
    grad.addColorStop(1, 'rgba(120,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  sharedTex = new THREE.CanvasTexture(c);
  return sharedTex;
}

export function EliteAura({ height }: { height: number }) {
  const group = useRef<THREE.Group>(null);
  const sprites = useMemo(() => Array.from({ length: PUFFS }, (_, i) => {
    const mat = new THREE.SpriteMaterial({ map: smokeTexture(), transparent: true, depthWrite: false, opacity: 0, color: '#ff3b2a' });
    const s = new THREE.Sprite(mat);
    s.raycast = () => {};
    s.userData['phase'] = i / PUFFS;
    s.userData['ox'] = (Math.random() - 0.5) * 0.6;
    s.userData['oz'] = (Math.random() - 0.5) * 0.6;
    return s;
  }), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => () => { for (const s of sprites) (s.material as THREE.SpriteMaterial).dispose(); }, [sprites]);

  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    g.getWorldPosition(tmp);
    const p = useGameStore.getState().player.position;
    const near = (p.x - tmp.x) ** 2 + (p.z - tmp.z) ** 2 < AURA_RANGE2;
    g.visible = near;
    if (!near) return;
    const t = clock.elapsedTime / CYCLE;
    for (const s of sprites) {
      const u = (t + (s.userData['phase'] as number)) % 1; // 0 → 1 subindo
      s.position.set((s.userData['ox'] as number) * height * 0.3, height * (0.25 + u * 0.95), (s.userData['oz'] as number) * height * 0.3);
      const k = height * (0.35 + u * 0.45);
      s.scale.set(k, k, 1);
      (s.material as THREE.SpriteMaterial).opacity = Math.sin(u * Math.PI) * 0.55;
    }
  });

  return <group ref={group}>{sprites.map((s, i) => <primitive key={i} object={s} />)}</group>;
}
