/**
 * GUARDA DO 3D (Pedro 26/10: o A17 do Caio "caiu do jogo"). Celular com pouca memória de vídeo DERRUBA o contexto
 * WebGL; antes o jogo nem percebia (tela preta/travada). Agora:
 *  1. contexto perdido → aviso na tela + recarrega sozinho em ~1,5 s (o save já sobe no `pagehide`);
 *  2. caiu de novo em < 10 min → volta no MODO LEVE (resolução menor e sem sombra; grama/árvores/arte iguais — regra
 *     do Pedro). Só liga em aparelho que caiu: PC/celular forte nunca entram nele.
 * Fora do React (eventos do canvas + localStorage protegido por try/catch).
 */
const LOST_KEY = 'tribos.gpu.lostAt';
const LOW_KEY = 'tribos.gpu.low';
export const RELOAD_DELAY_MS = 1500;
export const REPEAT_WINDOW_MS = 10 * 60_000;
/** Modo leve dura 3 dias (aparelho fraco continua fraco); depois tenta o normal de novo. */
export const LOW_MODE_MS = 3 * 24 * 60 * 60_000;

type KV = { getItem(k: string): string | null; setItem(k: string, v: string): void };
const store = (): KV | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };

/** Aparelho no modo leve? */
export function lowGpuMode(now = Date.now(), kv: KV | null = store()): boolean {
  try { const at = Number(kv?.getItem(LOW_KEY) ?? 0); return at > 0 && now - at < LOW_MODE_MS; } catch { return false; }
}

/** Registra uma queda; devolve true se foi a 2ª em pouco tempo (→ liga o modo leve). */
export function noteContextLost(now = Date.now(), kv: KV | null = store()): boolean {
  try {
    const prev = Number(kv?.getItem(LOST_KEY) ?? 0);
    kv?.setItem(LOST_KEY, String(now));
    if (prev > 0 && now - prev < REPEAT_WINDOW_MS) { kv?.setItem(LOW_KEY, String(now)); return true; }
  } catch { /* sem armazenamento: só recarrega */ }
  return false;
}

function showNotice(text: string): void {
  if (typeof document === 'undefined') return;
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.textContent = text;
  el.style.cssText = 'position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:24px;text-align:center;'
    + 'background:rgba(10,8,6,.86);color:#f3e6c8;font:600 16px/1.4 system-ui,sans-serif';
  document.body.appendChild(el);
}

/** Liga no canvas do jogo. Devolve a função que desliga. */
export function attachContextGuard(canvas: HTMLCanvasElement, reload: () => void = () => window.location.reload()): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const onLost = (e: Event) => {
    e.preventDefault();
    if (timer) return;
    const low = noteContextLost();
    showNotice(low
      ? 'O 3D do aparelho reiniciou de novo — voltando no MODO LEVE (mesmo jogo, menos peso). Seu progresso está salvo.'
      : 'O 3D do aparelho reiniciou — voltando… Seu progresso está salvo.');
    timer = setTimeout(reload, RELOAD_DELAY_MS);
  };
  canvas.addEventListener('webglcontextlost', onLost);
  return () => { canvas.removeEventListener('webglcontextlost', onLost); if (timer) clearTimeout(timer); };
}
