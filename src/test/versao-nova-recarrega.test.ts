import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isStaleChunkError, shouldReloadForStaleChunk, STALE_RELOAD_GAP_MS } from '@/net/stale-chunk';

/* Pedro, 04/11 (teste online): "apertei i e tá dando bug" — 404 em /assets/hero-preview-….js ("Failed to fetch dynamically
   imported module"): a página era da versão anterior e o deploy novo trocou o arquivo. Recarrega 1× sozinho. */
describe('versão nova no ar com o jogo aberto', () => {
  it('reconhece o erro nos navegadores', () => {
    expect(isStaleChunkError('Failed to fetch dynamically imported module: https://x/assets/hero-preview-boBZCuxg.js')).toBe(true);
    expect(isStaleChunkError('Importing a module script failed.')).toBe(true);
    expect(isStaleChunkError('error loading dynamically imported module')).toBe(true);
    expect(isStaleChunkError('Cannot read properties of undefined')).toBe(false);
  });
  it('recarrega 1×: nunca 2× em menos de 30 s (sem laço)', () => {
    const now = 1_000_000;
    expect(shouldReloadForStaleChunk(null, now)).toBe(true);
    expect(shouldReloadForStaleChunk(now - 5_000, now)).toBe(false);
    expect(shouldReloadForStaleChunk(now - STALE_RELOAD_GAP_MS - 1, now)).toBe(true);
  });
  it('ligado no início do app (junto do PWA)', () => {
    const r = fs.readFileSync('src/routes/__root.tsx', 'utf8');
    expect(r).toContain('useEffect(() => { startPwa(); startStaleChunkReload(); }, []);');
    const s = fs.readFileSync('src/net/stale-chunk.ts', 'utf8');
    expect(s).toContain("window.addEventListener('vite:preloadError', (e) => { if (reload()) e.preventDefault(); });");
  });
});
