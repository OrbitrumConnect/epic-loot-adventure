/**
 * Fogo/fumaça nas peças DANIFICADAS da base (sensação de "sob ataque / em
 * chamas" no mundo 3D). Camada puramente ADITIVA: lê `playerBase.pieces` da
 * store e desenha chamas nas peças com HP < máximo — sem tocar no render da
 * base do Caio. Quanto mais dano, maior a chama. Só re-monta quando o elenco de
 * peças danificadas muda; o tremeluzir é por quadro.
 */
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/game/state/game-store';
import { cellCenter } from '@/game/systems/playerBaseSystem';
import { terrainHeight } from './world-kit';

const flameMat = new THREE.MeshStandardMaterial({ color: '#ff7a22', emissive: new THREE.Color('#ff5a00'), emissiveIntensity: 2.4, flatShading: true, transparent: true, opacity: 0.95 });
const coreMat = new THREE.MeshStandardMaterial({ color: '#ffd36b', emissive: new THREE.Color('#ffc233'), emissiveIntensity: 2.8, flatShading: true });
const smokeMat = new THREE.MeshStandardMaterial({ color: '#2a2a2e', flatShading: true, transparent: true, opacity: 0.35 });
const coneGeo = new THREE.ConeGeometry(0.5, 1, 5);
const smokeGeo = new THREE.SphereGeometry(0.5, 5, 4);

/** Chama única numa peça. `lit` liga a luz tremeluzente (limitado por custo). */
function Flame({ x, y, z, intensity, lit, seed }: { x: number; y: number; z: number; intensity: number; lit: boolean; seed: number }) {
  const flame = useRef<THREE.Group>(null);
  const smoke = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const s = 0.5 + intensity * 0.8; // tamanho pela gravidade do dano
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + seed;
    const f = flame.current;
    if (f) {
      const p = 1 + Math.sin(t * 16) * 0.14 + Math.sin(t * 27) * 0.07;
      f.scale.set(s * p, s * (1 + Math.sin(t * 12) * 0.22), s * p);
      f.rotation.y = t * 1.6;
    }
    if (smoke.current) {
      const rise = (t * 0.6) % 1.4;
      smoke.current.position.y = 0.9 * s + rise;
      const m = smoke.current.material as THREE.MeshStandardMaterial;
      m.opacity = 0.32 * (1 - rise / 1.4);
      smoke.current.scale.setScalar(s * (0.5 + rise * 0.5));
    }
    if (light.current) light.current.intensity = (2.5 + intensity * 4) + Math.sin(t * 17) * 0.8;
  });
  return (
    <group position={[x, y + 0.2, z]}>
      <group ref={flame}>
        <mesh geometry={coneGeo} material={flameMat} position={[0, 0.35, 0]} scale={[0.4, 0.8, 0.4]} />
        <mesh geometry={coneGeo} material={coreMat} position={[0.02, 0.22, 0.01]} scale={[0.22, 0.46, 0.22]} />
      </group>
      <mesh ref={smoke} geometry={smokeGeo} material={smokeMat} position={[0, 0.9, 0]} scale={s * 0.5} />
      {lit && <pointLight ref={light} color="#ff8a3a" intensity={3} distance={8 + intensity * 4} decay={1.6} position={[0, 0.6, 0]} />}
    </group>
  );
}

export function BaseFireFX() {
  const base = useGameStore(s => s.playerBase);
  // Assinatura leve: só re-monta quando mudam as peças danificadas (id + faixa de HP).
  const sig = base ? base.pieces.filter(p => p.hp < p.maxHp).map(p => `${p.id}:${Math.round((p.hp / p.maxHp) * 4)}`).join('|') : '';

  const flames = useMemo(() => {
    if (!base) return [];
    const burning = base.pieces.filter(p => p.hp < p.maxHp);
    return burning.map((p, i) => {
      const c = cellCenter(p.cell);
      return {
        id: p.id,
        x: c.x,
        z: c.z,
        y: terrainHeight(c.x, c.z),
        intensity: Math.min(1, 1 - p.hp / p.maxHp),
        lit: i < 6, // custo: no máx 6 luzes acesas (as primeiras peças danificadas)
        seed: (i * 1.37) % 6.28,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  if (flames.length === 0) return null;
  return <>{flames.map(fl => <Flame key={fl.id} x={fl.x} y={fl.y} z={fl.z} intensity={fl.intensity} lit={fl.lit} seed={fl.seed} />)}</>;
}
