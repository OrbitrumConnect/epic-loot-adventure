/**
 * EXPLOSÃO DA BAZUCA fora dos bichos (05/11, Pedro: "mirando a bazuca pro navio inimigo no PvP já acerta, destrói? atirei e
 * parece não dar dano em nada"). O dano da explosão (`explosiveHit`) só pega BICHO e JOGADOR — navio pirata e navio de
 * outro jogador não são bicho. Quem desenha os navios (Zona Sul) se inscreve aqui e aplica no casco, como a bala do
 * canhão. Fora da Zona Sul: ninguém inscrito, nada muda.
 */
export type ExplosionHook = (at: { x: number; z: number }, radius: number, power: number) => void;
export const explosionHooks = new Set<ExplosionHook>();
export function runExplosionHooks(at: { x: number; z: number }, radius: number, power: number): void {
  for (const h of explosionHooks) { try { h(at, radius, power); } catch { /* um inscrito com erro não derruba o tiro */ } }
}
