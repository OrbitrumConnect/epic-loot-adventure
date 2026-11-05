/**
 * RESISTÊNCIA DE CHEFE (05/11). O Canibal Gigante do covil (corpo + raízes, ids `zs_canibal_…`) leva só uma FRAÇÃO do
 * dano que NÃO é míssil da bazuca. Pedro 04/11: "a bazuca dá praticamente todo o dano, o resto é fração" · 05/11: "o fuzil
 * pode dar dano nele também". Medido no covil: o fuzil segurado solta 10 balas/s e o míssil vale ~10 balas a cada 2,5 s —
 * sem a fração o fuzil batia MAIS que a bazuca. Com 10% por bala: fuzil segurado ≈ ¼ da bazuca, o piloto ≈ 1/10.
 * O míssil (`pierce`) passa inteiro. Fora do Canibal: ×1 (nada muda em nenhum outro bicho).
 */
export const CANIBAL_ID_PREFIX = 'zs_canibal_';
/** fração do dano não-míssil que o Canibal leva (fuzil, pistola, arco, machado, especial, poderes) */
export const CANIBAL_GUN_K = 0.1;

/** Multiplicador do dano que `id` leva (míssil da bazuca = `pierce` → inteiro). */
export function bossDamageK(id: string, pierce = false): number {
  if (pierce || !id.startsWith(CANIBAL_ID_PREFIX)) return 1;
  return CANIBAL_GUN_K;
}
/** `power` já com a resistência do chefe (sem ir a 0: o golpe sempre conta 1). */
export function bossPower(id: string, power: number, pierce = false): number {
  const k = bossDamageK(id, pierce);
  return k === 1 ? power : Math.max(1, Math.round(power * k));
}
