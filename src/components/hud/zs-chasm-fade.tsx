import { useZsChasmFx } from '@/components/zona-sul/zs-chasm';

/** CAIU NO PRECIPÍCIO (05/11, zs-chasm.ts): a tela escurece num instante e abre no checkpoint (o pulo de lugar não fica
 *  seco). Só CSS (uma animação de 0,7 s por queda) — nada roda quando não cai. */
export function ZsChasmFade() {
  const at = useZsChasmFx((s) => s.at);
  if (!at) return null;
  return <div key={at} className="zs-chasm-fade" aria-hidden="true" />;
}
