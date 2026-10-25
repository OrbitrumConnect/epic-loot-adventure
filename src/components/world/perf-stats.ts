/**
 * Números do painel de DESEMPENHO (Pedro 25/10: "medir o que melhorou e piorou, pra não travar em PC lento").
 * Módulo simples (sem 3D): o medidor dentro da cena (`perf-probe.tsx`) escreve, o painel HTML lê.
 */
export const perfStats = {
  /** Quadros por segundo (média da janela de 0,5 s). */
  fps: 0,
  /** Tempo médio de quadro (ms). */
  avgMs: 0,
  /** PIOR quadro da janela (ms) — as "travadas". */
  worstMs: 0,
  /** Chamadas de desenho e triângulos da cena (último quadro). */
  calls: 0,
  tris: 0,
  /** Resolução dinâmica atual (densidade de pixel). */
  dpr: 1,
  /** Bichos/inimigos vivos no mundo. */
  creatures: 0,
  version: 0,
};

/** Acumula um quadro; fecha a janela a cada `win` s. Puro (testável). */
export function accumulateFrame(acc: { t: number; n: number; worst: number }, dt: number, win = 0.5): { fps: number; avgMs: number; worstMs: number } | null {
  acc.t += dt;
  acc.n += 1;
  if (dt > acc.worst) acc.worst = dt;
  if (acc.t < win) return null;
  const out = { fps: acc.n / acc.t, avgMs: (acc.t / acc.n) * 1000, worstMs: acc.worst * 1000 };
  acc.t = 0; acc.n = 0; acc.worst = 0;
  return out;
}
