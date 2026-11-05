/**
 * BAZUCA (04/11, Pedro: "matou o Kraken libera a bazuca … libera pra fabricar após matar o Kraken; no card abaixo do navio;
 * usa um materialzinho; cada bala usa material isolado"). Regras PURAS (testáveis) — o tiro e a explosão moram na store
 * (`fireBazooka` → `explosiveHit`, o mesmo dano em área do canhão do navio), o desenho em `projectiles.tsx`.
 *  - Libera com a marca `krakenSlain` (quem estava na luta quando o corpo do Kraken morreu).
 *  - Custos aprovados pelo Pedro: bazuca 120 ferro + 60 madeira + 40 pedra (1 por personagem); míssil 6 ferro + 4 pedra
 *    + 2 madeira CADA (1 por clique). Pagam como o navio/carro: o armazém primeiro, a bolsa completa.
 *  - Tiro: 1 míssil, recarga 2,5 s; o míssil VOA (visível) e explode onde chega — dano em área (6 m) = ~10 balas de fuzil.
 */
export const BAZOOKA = {
  /** custo da bazuca (1 por personagem) e de CADA míssil */
  COST: [{ id: 'iron_ore', n: 120 }, { id: 'wood', n: 60 }, { id: 'stone', n: 40 }],
  MISSILE_COST: [{ id: 'iron_ore', n: 6 }, { id: 'stone', n: 4 }, { id: 'wood', n: 2 }],
  /** raio da explosão (m) */
  SPLASH_R: 6,
  /** força do míssil = (golpe base + poder da arma + equipamento) × isto × multiplicadores do herói (~10 balas de fuzil) */
  POWER_K: 10,
  /** velocidade do míssil (m/s) — dá pra ver voando (a bala vai a 220) */
  MISSILE_SPEED: 70,
  /** o braço chega na mira antes de o míssil sair (o mesmo das armas de fogo) */
  LAUNCH_DELAY_MS: 90,
} as const;

/** Quanto o míssil leva até explodir (ms) a `dist` metros — o dano cai junto com a bola de fogo. */
export const missileFlightMs = (dist: number) => BAZOOKA.LAUNCH_DELAY_MS + (Math.max(0, dist) / BAZOOKA.MISSILE_SPEED) * 1000;

/** Motivo pra não fabricar (null = pode). `owned` = já tem a bazuca; `missing` = o que falta de material. */
export function bazookaCraftBlock(kind: 'bazooka' | 'missile', krakenSlain: boolean, owned: boolean, missing: { id: string; n: number }[]): string | null {
  if (!krakenSlain) return '🔒 Mate o Kraken das Cagarras';
  if (kind === 'bazooka' && owned) return 'Você já tem';
  if (missing.length > 0) return 'Falta material';
  return null;
}
