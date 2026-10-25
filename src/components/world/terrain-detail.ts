/**
 * Chave do DETALHE DO CHÃO (ideia do mod "Better Terrain", Pedro 25/10). Módulo simples (sem 3D) — a tecla L
 * (index.tsx) liga/desliga; o chão (`map-floor.tsx`) lê e faz a transição suave. Começa DESLIGADO: o Pedro compara
 * no jogo e decide. Lembra a escolha no aparelho.
 */
const KEY = 'tribos.detail';
export const terrainDetail = { on: readSaved() };
function readSaved(): boolean {
  try { return typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === '1'; } catch { return false; }
}
export function toggleTerrainDetail(): boolean {
  terrainDetail.on = !terrainDetail.on;
  try { localStorage.setItem(KEY, terrainDetail.on ? '1' : '0'); } catch { /* sem storage */ }
  return terrainDetail.on;
}
