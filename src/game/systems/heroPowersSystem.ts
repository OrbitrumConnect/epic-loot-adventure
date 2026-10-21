/**
 * PODERES DO HERÓI (Pedro 21/10) — mesmo esquema da Chuva de Flechas: só COOLDOWN gateia
 * (sem mana/stamina), desbloqueio por nível, clique OU automático no idle, escala com o nível
 * (0 no nv1 → cheio no nv200), tamanho do HERÓI (não gigante como os da base).
 *  - Bumerangue (nv10): 3 lâminas giram em volta do torso numa espiral que abre de ~1,5 m
 *    até ~10 m, cortam e afastam de leve quem encosta.
 *  - Furacão (nv15): 2 tornados saem do herói em zigue-zague quase reto até ~12 m — dano +
 *    EMPURRÃO forte (colisão leve: o empurrão passa pelas paredes/muros no AI do bicho).
 *  - Raio (nv20): relâmpagos caem nos hostis mais próximos (dano alto + respingo pequeno).
 * Puro e testável; quem aplica dano/empurrão é o store (`castHeroPower`/`tickHeroPowers`).
 */
export type HeroPowerId = 'boomerang' | 'tornado' | 'lightning';
export type Vec2 = { x: number; z: number };

export const HERO_POWER_IDS: HeroPowerId[] = ['boomerang', 'tornado', 'lightning'];
export const HERO_POWER_UNLOCK: Record<HeroPowerId, number> = { boomerang: 10, tornado: 15, lightning: 20 };
export const HERO_POWER_LABEL: Record<HeroPowerId, string> = { boomerang: 'Bumerangue', tornado: 'Furacão', lightning: 'Raio' };

export const HERO_POWER_TICK_MS = 250;

// Bumerangue (Pedro): 3 lâminas em volta do torso numa ESPIRAL que abre de R0 até R1.
export const BOOMERANG_DURATION_MS = 6000;
export const BOOMERANG_BLADES = 3;
export const BOOMERANG_SPEED = 2.6;      // rad/s
export const BOOMERANG_R0 = 1.5;         // m: começa colado no corpo
export const BOOMERANG_R1 = 10;          // m: abre até ~10 m
export const BOOMERANG_HIT_RADIUS = 1.6; // m em volta de cada lâmina
export const BOOMERANG_PUSH = 0.6;       // m por acerto, pra fora do herói
export const BOOMERANG_DMG_MULT = 0.35;  // por tick

// Furacão (Pedro): saem 2 TORNADOS do herói, em zigue-zague quase reto, até ~12 m.
export const TORNADO_COUNT = 2;
export const TORNADO_RANGE = 12;         // m
export const TORNADO_SPEED = 6;          // m/s → 2 s de viagem
export const TORNADO_DURATION_MS = (TORNADO_RANGE / TORNADO_SPEED) * 1000;
export const TORNADO_HIT_RADIUS = 2.2;   // m em volta de cada tornado
export const TORNADO_SPREAD = 1.1;       // m: separação lateral entre os dois
export const TORNADO_ZIGZAG = 0.9;       // m: amplitude do zigue-zague
export const TORNADO_PUSH = 1.4;         // empurrão forte pra longe do tornado
export const TORNADO_DMG_MULT = 0.5;     // por tick

// Raio
export const LIGHTNING_TARGETS = 4;
export const LIGHTNING_DMG_MULT = 1.8;
export const LIGHTNING_SPLASH = 1.5;     // respingo em volta do ponto atingido
export const LIGHTNING_BOLT_MS = 350;    // quanto tempo o clarão fica na tela

/** Fator de escala por nível (igual à Chuva de Flechas): 0 no nv1 → 1 no nv200+. */
export function powerT(level: number): number {
  return Math.min(1, Math.max(0, (level - 1) / 199));
}
const lerp1 = (a: number, b: number, t: number) => Math.round((a + (b - a) * t) * 10) / 10;

/** Cooldown (s): cai com o nível. */
export function heroPowerCooldown(id: HeroPowerId, level: number): number {
  const t = powerT(level);
  if (id === 'boomerang') return lerp1(18, 8, t);
  if (id === 'tornado') return lerp1(20, 9, t);
  return lerp1(16, 6, t);
}

/** Alcance (m): até onde a espiral abre / os tornados vão / busca de alvos do raio. */
export function heroPowerRadius(id: HeroPowerId, level: number): number {
  if (id === 'boomerang') return BOOMERANG_R1;
  if (id === 'tornado') return TORNADO_RANGE;
  return lerp1(14, 22, powerT(level));
}

/** Raio da espiral do bumerangue no progresso 0..1 (abre do corpo até ~10 m). */
export function boomerangSpiralRadius(progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  return BOOMERANG_R0 + (BOOMERANG_R1 - BOOMERANG_R0) * p;
}

/** Posições das 3 lâminas em volta do herói (espiral) no progresso 0..1 e instante `nowMs`. */
export function heroBoomerangPositions(center: Vec2, progress: number, nowMs: number): Vec2[] {
  const r = boomerangSpiralRadius(progress);
  const a0 = (nowMs / 1000) * BOOMERANG_SPEED;
  const out: Vec2[] = [];
  for (let i = 0; i < BOOMERANG_BLADES; i++) {
    const a = a0 + (i / BOOMERANG_BLADES) * Math.PI * 2;
    out.push({ x: center.x + Math.cos(a) * r, z: center.z + Math.sin(a) * r });
  }
  return out;
}

/**
 * Posições dos 2 tornados no progresso 0..1: saem de `origin` na direção `dir` (normalizada),
 * avançando até TORNADO_RANGE, cada um num lado (±SPREAD) com zigue-zague leve (quase reto).
 */
export function heroTornadoPositions(origin: Vec2, dir: Vec2, progress: number): Vec2[] {
  const p = Math.min(1, Math.max(0, progress));
  const len = Math.hypot(dir.x, dir.z) || 1;
  const fx = dir.x / len, fz = dir.z / len;   // frente
  const sx = -fz, sz = fx;                     // lado
  const fwd = 1 + (TORNADO_RANGE - 1) * p;
  const out: Vec2[] = [];
  for (let i = 0; i < TORNADO_COUNT; i++) {
    const side = (i === 0 ? -1 : 1) * TORNADO_SPREAD;
    const zig = Math.sin(p * Math.PI * 4 + i * Math.PI) * TORNADO_ZIGZAG;
    const lat = side + zig;
    out.push({ x: origin.x + fx * fwd + sx * lat, z: origin.z + fz * fwd + sz * lat });
  }
  return out;
}

/** Vetor de empurrão de `pos` pra LONGE de `from` com intensidade `strength` (m). */
export function pushAway(from: Vec2, pos: Vec2, strength: number): Vec2 {
  const dx = pos.x - from.x;
  const dz = pos.z - from.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) return { x: strength, z: 0 }; // em cima do centro: empurra pra um lado
  return { x: (dx / len) * strength, z: (dz / len) * strength };
}
