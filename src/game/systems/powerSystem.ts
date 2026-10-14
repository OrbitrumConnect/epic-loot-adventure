/**
 * POWERS da base (Fase ELITE) — ataques orbitais/AoE escolhidos nas cartas de
 * evolução. Puro/testável: a matemática mora aqui, o store aplica dano e o
 * render desenha. Portável pro servidor depois (mesma função decide posição).
 *
 * Primeiro power: BUMERANGUES orbitando o núcleo da base (pedido do Pedro —
 * "3 girando em volta da base"). Mais stacks = mais bumerangues e mais dano.
 */
export type Vec2 = { x: number; z: number };

export const ORBIT_RADIUS = 9.6;      // distância do núcleo (m) — +20%, gira FORA do muro
export const ORBIT_SPEED = 1.28;      // rad/s — −20% (mais lento, lê melhor)
export const ORBIT_HIT_RADIUS = 2.2;  // raio de acerto de cada bumerangue (m)
export const ORBIT_TICK_MS = 250;     // intervalo entre aplicações de dano
export const ORBIT_Y = 1.3;           // altura visual dos bumerangues
export const ORBIT_PUSH = 0.5;        // empurrão leve (m) pra FORA da base a cada acerto
/** Duração do poder em ONDAS: 5 na 1ª escolha, +2 por renovação. Expira depois. */
export const ORBIT_BASE_WAVES = 5;
export const ORBIT_EXTEND_WAVES = 2;

/** Quantos bumerangues giram dado o nº de escolhas (`stacks`). 1ª escolha = 3. */
export function orbitCount(stacks: number): number {
  if (stacks <= 0) return 0;
  return 3 + (stacks - 1); // 3, 4, 5...
}

/** Dano por acerto (por tick) — BAIXO de propósito: ele empurra, não limpa. */
export function orbitDamage(stacks: number): number {
  return 7 + 5 * Math.max(0, stacks - 1); // 7, 12, 17...
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
