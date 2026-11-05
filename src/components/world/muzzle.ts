/**
 * BOCA DA ARMA do herói local (Pedro 01/11: "o tiro sai do meio do personagem, não da boca da arma; ele levantou a mão
 * mas o tiro sai mais rápido que ela"). A arma na mão (`HeldItem`) escreve aqui, todo quadro, onde está a ponta do
 * cano/arco no mundo; o projétil do herói nasce daí. O tiro de ARMA DE FOGO aparece (e soa) `HERO_SHOT_DELAY_MS` depois
 * do clique: é o tempo da transição pro clipe de tiro (o `attack_gun` já começa mirando — medido: o braço mexe só 2–5°
 * no clipe inteiro) — o dano continua na hora.
 */
export const heroMuzzle = { x: 0, y: 0, z: 0, at: -1 };
export { HERO_SHOT_DELAY_MS } from '@/game/systems/feedbackSystem';
/** Ponta da arma no espaço da MÃO (cano pro +Z), medida nos GLB da pistola/fuzil (`weapon-models.tsx`: comprimento ×
 *  (1 − pega)) e no arco desenhado. */
export const MUZZLE_OFFSET: Record<string, [number, number, number]> = {
  pistol: [0, 0.03, 0.34],
  rifle: [0, 0.03, 0.74],
  /** 04/11: a boca da bazuca (o tubo ~15 cm acima da mão, ~0,8 m pra frente) */
  bazooka: [0, 0.15, 0.8],
  bow: [0, 0, 0.14],
};
/** A boca é recente (a arma está na mão agora)? */
export function heroMuzzleFresh(now = performance.now()): boolean {
  return heroMuzzle.at > 0 && now - heroMuzzle.at < 400;
}
