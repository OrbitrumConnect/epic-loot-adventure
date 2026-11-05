/**
 * RESISTÊNCIA DE CHEFE (05/11). O Canibal Gigante do covil (corpo + raízes, ids `zs_canibal_…`) leva só uma FRAÇÃO do
 * dano que NÃO é míssil da bazuca. Pedro 04/11: "a bazuca dá praticamente todo o dano, o resto é fração" · 05/11: "o fuzil
 * pode dar dano nele também". Medido no covil: o fuzil segurado solta 10 balas/s e o míssil vale ~10 balas a cada 2,5 s —
 * sem a fração o fuzil batia MAIS que a bazuca. Com 10% por bala: fuzil segurado ≈ ¼ da bazuca, o piloto ≈ 1/10.
 * O míssil (`pierce`) passa inteiro. Fora do Canibal: ×1 (nada muda em nenhum outro bicho).
 * 05/11 (2ª, Pedro: "tiro de arma etc. dá dano, mas bem mais fraco pra dificultar — ele tem proteção, pode tirar uns 5 por
 * aí"): além dos 10%, NO MÁXIMO 5 por golpe (o sorteio/crítico do combate em cima: ~4–6, crítico ~10). Fuzil segurado
 * (10 balas/s) ≈ 50/s contra ~1.200/s da bazuca (~4%).
 */
export const CANIBAL_ID_PREFIX = 'zs_canibal_';
/** fração do dano não-míssil que o Canibal leva (fuzil, pistola, arco, machado, especial, poderes) */
export const CANIBAL_GUN_K = 0.1;
/** PROTEÇÃO: teto do golpe não-míssil no Canibal (antes do sorteio/crítico do combate) */
export const CANIBAL_GUN_MAX = 5;

/** Multiplicador do dano que `id` leva (míssil da bazuca = `pierce` → inteiro). */
export function bossDamageK(id: string, pierce = false): number {
  if (pierce || !id.startsWith(CANIBAL_ID_PREFIX)) return 1;
  return CANIBAL_GUN_K;
}
/** RAIZ do Canibal × míssil (05/11, Pedro: "cada tentáculo destrói com 3 bazukadas — de 1 já foi"): o míssil escala com
 *  nível e equipamento (ataque × 10) e matava a raiz de uma vez. Agora cada míssil tira no MÁXIMO 1/3 da vida dela (depois do
 *  sorteio/crítico) → 3 bazucadas (com míssil fraco, mais). Corpo e outros bichos: igual. */
export const CANIBAL_ROOT_PREFIX = 'zs_canibal_r';
export const CANIBAL_ROOT_MISSILES = 3;
export function bossCapHit(id: string, pierce: boolean, maxHp: number, damage: number): number {
  return pierce && id.startsWith(CANIBAL_ROOT_PREFIX) ? Math.min(damage, Math.ceil(maxHp / CANIBAL_ROOT_MISSILES)) : damage;
}
/** `power` já com a resistência do chefe (sem ir a 0: o golpe sempre conta 1; no máximo CANIBAL_GUN_MAX). */
export function bossPower(id: string, power: number, pierce = false): number {
  const k = bossDamageK(id, pierce);
  return k === 1 ? power : Math.max(1, Math.min(CANIBAL_GUN_MAX, Math.round(power * k)));
}
