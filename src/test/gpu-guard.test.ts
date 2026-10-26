import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { attachContextGuard, LOW_MODE_MS, lowGpuMode, noteContextLost, RELOAD_DELAY_MS, REPEAT_WINDOW_MS } from '@/components/world/gpu-guard';

/* Pedro, 26/10: o A17 do Caio "caiu do jogo" e o jogo nem percebia. Guarda: recarrega sozinho; caiu 2× → modo leve. */
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };

describe('guarda do 3D (contexto WebGL perdido)', () => {
  it('1ª queda: só recarrega; 2ª em < 10 min: liga o modo leve, que dura 3 dias', () => {
    const kv = mem();
    expect(noteContextLost(1_000, kv)).toBe(false);
    expect(lowGpuMode(1_000, kv)).toBe(false);
    expect(noteContextLost(1_000 + REPEAT_WINDOW_MS - 1, kv)).toBe(true);
    expect(lowGpuMode(2_000_000, kv)).toBe(true);
    expect(lowGpuMode(1_000 + REPEAT_WINDOW_MS + LOW_MODE_MS + 1, kv)).toBe(false); // passou: tenta o normal
    const kv2 = mem();
    noteContextLost(0, kv2);
    expect(noteContextLost(REPEAT_WINDOW_MS + 1, kv2)).toBe(false); // quedas espaçadas: não liga
  });
  it('sem armazenamento (navegador anônimo): não quebra, só recarrega', () => {
    expect(noteContextLost(1, null)).toBe(false);
    expect(lowGpuMode(1, null)).toBe(false);
  });
  it('canvas perde o contexto → aviso na tela e recarrega em ~1,5 s (uma vez só)', () => {
    vi.useFakeTimers();
    const canvas = document.createElement('canvas');
    const reload = vi.fn();
    const off = attachContextGuard(canvas, reload);
    const ev = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(ev);
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(ev.defaultPrevented).toBe(true);
    expect(document.body.textContent).toContain('progresso está salvo');
    vi.advanceTimersByTime(RELOAD_DELAY_MS);
    expect(reload).toHaveBeenCalledTimes(1);
    off();
    vi.useRealTimers();
  });
  it('ligado no Canvas; modo leve = sem sombra e resolução menor (arte igual)', () => {
    const gw = fs.readFileSync('src/components/game-world.tsx', 'utf8');
    expect(gw).toMatch(/onCreated=\{\(\{ gl \}\) => \{ attachContextGuard\(gl\.domElement\); \}\}/);
    expect(gw).toMatch(/<Canvas shadows=\{LOW_GPU \? false : 'percentage'\}/);
    expect(gw).toMatch(/if \(LOW_GPU\) return 0\.85;/);
  });
});
