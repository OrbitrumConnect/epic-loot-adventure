/**
 * Base própria do jogador no mundo aberto (Fase 3, vertical slice). Lê
 * `playerBase` da store e ergue uma estrutura low-poly: fundação de pedra,
 * muros com porta ao sul, mastro com bandeira e, por tier, teto e torres.
 * Só re-renderiza quando a base muda (claim/upgrade), nunca a 60 Hz.
 */
import { useGameStore } from '@/game/state/game-store';
import { claimRadius } from '@/game/systems/baseClaimSystem';
import { mixColor, terrainHeight, type Palette } from './world-kit';

export function PlayerBaseView({ c }: { c: Palette }) {
  const base = useGameStore(s => s.playerBase);
  if (!base) return null;

  const { position, tier } = base;
  const y = terrainHeight(position.x, position.z);
  const side = claimRadius(tier) * 0.9; // meia-largura do quadrado de muros
  const wallH = 1.5 + tier * 0.18;
  const t = 0.3;
  const doorGap = 1.8;
  const seg = side - doorGap / 2; // comprimento de cada lado da porta

  const wood = c.trunk;
  const woodDark = mixColor(c.trunk, c.dark, 0.4);
  const stone = c['rock-light'];
  const flag = c.cloak;
  const metal = c.metal;

  return (
    <group position={[position.x, y, position.z]}>
      {/* Fundação */}
      <mesh position={[0, 0.07, 0]} receiveShadow>
        <boxGeometry args={[side * 2 + 1, 0.14, side * 2 + 1]} />
        <meshStandardMaterial color={stone} flatShading />
      </mesh>

      {/* Muros N / L / O (inteiros) */}
      <mesh position={[0, wallH / 2 + 0.1, -side]} castShadow>
        <boxGeometry args={[side * 2, wallH, t]} />
        <meshStandardMaterial color={wood} flatShading />
      </mesh>
      <mesh position={[side, wallH / 2 + 0.1, 0]} castShadow>
        <boxGeometry args={[t, wallH, side * 2]} />
        <meshStandardMaterial color={wood} flatShading />
      </mesh>
      <mesh position={[-side, wallH / 2 + 0.1, 0]} castShadow>
        <boxGeometry args={[t, wallH, side * 2]} />
        <meshStandardMaterial color={wood} flatShading />
      </mesh>
      {/* Muro S com PORTA no meio (2 segmentos) */}
      <mesh position={[-(doorGap / 2 + seg / 2), wallH / 2 + 0.1, side]} castShadow>
        <boxGeometry args={[seg, wallH, t]} />
        <meshStandardMaterial color={wood} flatShading />
      </mesh>
      <mesh position={[doorGap / 2 + seg / 2, wallH / 2 + 0.1, side]} castShadow>
        <boxGeometry args={[seg, wallH, t]} />
        <meshStandardMaterial color={wood} flatShading />
      </mesh>
      {/* Verga da porta */}
      <mesh position={[0, wallH + 0.1, side]}>
        <boxGeometry args={[doorGap + 0.2, 0.3, t]} />
        <meshStandardMaterial color={woodDark} flatShading />
      </mesh>

      {/* Mastro + bandeira no centro */}
      <mesh position={[0, 1.4, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.07, 2.8, 6]} />
        <meshStandardMaterial color={woodDark} flatShading />
      </mesh>
      <mesh position={[0.45, 2.4, 0]}>
        <boxGeometry args={[0.8, 0.5, 0.04]} />
        <meshStandardMaterial color={flag} flatShading />
      </mesh>

      {/* Teto/cabana (tier >= 2): um abrigo no canto */}
      {tier >= 2 && (
        <group position={[-side + 1.6, 0, -side + 1.6]}>
          <mesh position={[0, 1, 0]} castShadow>
            <boxGeometry args={[2.2, 1.6, 2.2]} />
            <meshStandardMaterial color={woodDark} flatShading />
          </mesh>
          <mesh position={[0, 2.1, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[1.9, 1.1, 4]} />
            <meshStandardMaterial color={stone} flatShading />
          </mesh>
        </group>
      )}

      {/* Torres nos cantos (tier >= 3) */}
      {tier >= 3 && ([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).map(([sx, sz], i) => (
        <group key={i} position={[sx * side, 0, sz * side]}>
          <mesh position={[0, (wallH + 0.8) / 2 + 0.1, 0]} castShadow>
            <boxGeometry args={[t * 2.2, wallH + 0.8, t * 2.2]} />
            <meshStandardMaterial color={wood} flatShading />
          </mesh>
          <mesh position={[0, wallH + 1.1, 0]} castShadow>
            <coneGeometry args={[0.55, 0.7, 4]} />
            <meshStandardMaterial color={metal} flatShading />
          </mesh>
        </group>
      ))}
    </group>
  );
}
