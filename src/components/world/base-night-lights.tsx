/**
 * Refletores das TORRES da base — acendem à noite e iluminam a área ao redor
 * (a base ficava escura demais). Camada ADITIVA: lê `playerBase.pieces` (torres)
 * e põe uma luz no topo de cada uma. Já com CULLING (só quando o jogador está
 * perto da base E é noite) pra não custar de dia nem longe. Não toca no render
 * da base do Caio. Só re-monta quando as torres mudam.
 */
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/game/state/game-store';
import { cellCenter } from '@/game/systems/playerBaseSystem';
import { nightFactor } from '@/game/systems/dayNightSystem';
import { terrainHeight } from './world-kit';
import { lightAllowed, useLightId } from './light-budget';
import { requestLight } from './light-pool';

/** Distância² da base dentro da qual os refletores ligam (base é o lar — raio generoso). */
const BASE_LIGHT_D2 = 70 * 70;

function TowerLight({ x, y, z }: { x: number; y: number; z: number }) {
  const light = useRef<THREE.PointLight>(null);
  const lightId = useLightId();
  useFrame(() => {
    const l = light.current;
    if (!l) return;
    const nf = nightFactor();
    const p = useGameStore.getState().player.position;
    const d2 = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
    // Zona Sul (pool de luzes ativo, 31/10): pede vaga no pool — a luz própria nunca acende (sem recompilar shader)
    if (requestLight(x, y + 4.6, z, '#ffe9c0', nf > 0.04 && d2 < BASE_LIGHT_D2 ? nf * 9 : 0, 24, 1.2)) { l.visible = false; return; }
    l.visible = lightAllowed(lightId, nf > 0.04 && d2 < BASE_LIGHT_D2, d2); // + orçamento de luzes no celular
    if (l.visible) l.intensity = nf * 9; // forte: ilumina a base à noite
  });
  return <pointLight ref={light} position={[x, y + 4.6, z]} color="#ffe9c0" intensity={0} distance={24} decay={1.2} />;
}

export function BaseNightLights() {
  const base = useGameStore(s => s.playerBase);
  const towers = useMemo(() => {
    if (!base) return [] as { id: string; x: number; y: number; z: number }[];
    return base.pieces
      .filter(p => p.kind === 'tower')
      .map(p => { const c = cellCenter(p.cell); return { id: p.id, x: c.x, y: terrainHeight(c.x, c.z), z: c.z }; });
  }, [base]);

  if (towers.length === 0) return null;
  return <>{towers.map(t => <TowerLight key={t.id} x={t.x} y={t.y} z={t.z} />)}</>;
}
