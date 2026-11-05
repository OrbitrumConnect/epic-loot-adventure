/**
 * BICHO GRANDE (04/11): o raio do corpo de chefes gigantes (o Canibal do covil: o corpo tem ~12 m de raio). A explosão
 * (bazuca/canhão — `explosiveHit`) mede até o centro do bicho; sem descontar o corpo, um míssil na "pele" de um gigante
 * explodia a 12 m do centro e não contava. Quem desenha o chefe escreve aqui; a explosão desconta. Fora daqui: 0.
 */
const radius = new Map<string, number>();
export function setBigCreatureRadius(id: string, r: number | null): void {
  if (r === null || !(r > 0)) radius.delete(id); else radius.set(id, r);
}
export function bigCreatureRadius(id: string): number { return radius.get(id) ?? 0; }
