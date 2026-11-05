/**
 * VERSÃO NOVA NO AR COM O JOGO ABERTO (04/11, Pedro no teste online: apertou "i" e deu "Failed to fetch dynamically
 * imported module …/assets/hero-preview-….js" com 404). A página aberta é da versão ANTERIOR: quando ela pede um pedaço
 * que só carrega na hora (inventário, prévia do herói…), o deploy novo já trocou o arquivo. Recarrega UMA vez — o
 * `?room=` da URL volta pra mesma sala; se já recarregou há menos de 30 s, não insiste (sem laço) e o erro segue normal.
 */
export const STALE_RELOAD_KEY = 'tribos:staleReloadAt';
export const STALE_RELOAD_GAP_MS = 30_000;

/** Pode recarregar agora? (pura) — nunca 2× em menos de 30 s. */
export function shouldReloadForStaleChunk(lastAt: number | null, now: number): boolean {
  return lastAt === null || !Number.isFinite(lastAt) || now - lastAt > STALE_RELOAD_GAP_MS;
}
/** É o erro de "pedaço da versão antiga sumiu"? (Chrome/Edge, Safari, Firefox) */
export function isStaleChunkError(message: string): boolean {
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message);
}

let started = false;
export function startStaleChunkReload(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  const reload = (): boolean => {
    let last: number | null = null;
    try { last = Number(window.sessionStorage.getItem(STALE_RELOAD_KEY)) || null; } catch { /* sem storage: segue */ }
    if (!shouldReloadForStaleChunk(last, Date.now())) return false;
    try { window.sessionStorage.setItem(STALE_RELOAD_KEY, String(Date.now())); } catch { /* idem */ }
    window.location.reload();
    return true;
  };
  // o Vite avisa quando um import dinâmico (ou o que ele pré-carrega) falha
  window.addEventListener('vite:preloadError', (e) => { if (reload()) e.preventDefault(); });
  // e quem escapar disso (promessa rejeitada sem ninguém tratar)
  window.addEventListener('unhandledrejection', (e) => {
    const r = (e as PromiseRejectionEvent).reason as { message?: unknown } | undefined;
    if (isStaleChunkError(String(r?.message ?? r ?? ''))) reload();
  });
}
