/**
 * POWERS da base (Fase ELITE) — ataques orbitais/AoE escolhidos nas cartas de
 * evolução. Puro/testável: a matemática mora aqui, o store aplica dano e o
 * render desenha. Portável pro servidor depois (mesma função decide posição).
 *
 * Primeiro power: BUMERANGUES orbitando o núcleo da base (pedido do Pedro —
 * "3 girando em volta da base"). Mais stacks = mais bumerangues e mais dano.
 */
export type Vec2 = { x: number; z: number };

export const ORBIT_RADIUS = 8;        // distância do núcleo (m)
export const ORBIT_SPEED = 1.6;       // rad/s (velocidade do giro)
export const ORBIT_HIT_RADIUS = 2.2;  // raio de acerto de cada bumerangue (m)
export const ORBIT_TICK_MS = 250;     // intervalo entre aplicações de dano
export const ORBIT_Y = 1.3;           // altura visual dos bumerangues

/** Quantos bumerangues giram dado o nº de escolhas (`stacks`). 1ª escolha = 3. */
export function orbitCount(stacks: number): number {
  if (stacks <= 0) return 0;
  return 3 + (stacks - 1); // 3, 4, 5...
}

/** Dano por acerto (por tick) — cresce com os stacks. */
export function orbitDamage(stacks: number): number {
  return 14 + 10 * Math.max(0, stacks - 1); // 14, 24, 34...
}

/** Posições dos bumerangues ao redor de `center` neste instante `now` (ms). */
export function boomerangPositions(center: Vec2, count: number, now: number): Vec2[] {
  const out: Vec2[] = [];
  if (count <= 0) return out;
  const base = (now / 1000) * ORBIT_SPEED;
  for (let i = 0; i < count; i++) {
    const ang = base + (i / count) * Math.PI * 2;
    out.push({ x: center.x + Math.cos(ang) * ORBIT_RADIUS, z: center.z + Math.sin(ang) * ORBIT_RADIUS });
  }
  return out;
}

/** Distância ao quadrado (evita sqrt no loop de dano). */
export function dist2(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}
