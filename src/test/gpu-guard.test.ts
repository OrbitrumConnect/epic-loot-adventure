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

/* 26/10 (Pedro: "nada afeta multiplayer?"): a guarda volta pra MESMA sala; sala salva antes da atualização retoma sem
   raposa/robô e com os inimigos novos dos acampamentos. */
describe('multiplayer: guarda e retomada de sala', () => {
  it('guarda recarrega pro endereço com a sala (o painel de Salas reentra sozinho)', () => {
    const src = fs.readFileSync('src/components/world/gpu-guard.ts', 'utf8');
    expect(src).toMatch(/if \(room\) window\.location\.href = inviteLink\(room\);/);
  });
  it('foto antiga: some raposa/robô soltos e as 3 raposas do início; entram os ids novos; a foto manda nos que tem', async () => {
    const { mergeResumedWorld } = await import('@/game/systems/wildlifeSystem');
    const mk = (id: string, speciesId: string, hp = 10) => ({ id, speciesId, hp } as never);
    const snap = [mk('wild_wolf_3', 'wolf'), mk('wild_pelter_1', 'pelter'), mk('wolf_2', 'wolf'), mk('wild_deer_1', 'deer', 3), mk('raider_outpost_e0', 'raider_scout', 1), mk('wild_pigeon_night_4', 'pigeon')];
    const now = [mk('wild_deer_1', 'deer', 99), mk('raider_outpost_e0', 'raider_scout', 99), mk('raider_outpost_e6', 'raider_shaman')];
    const out = mergeResumedWorld(snap, now) as unknown as { id: string; hp: number }[];
    expect(out.map((c) => c.id)).toEqual(['wild_deer_1', 'raider_outpost_e0', 'wild_pigeon_night_4', 'raider_outpost_e6']);
    expect(out[0]!.hp).toBe(3); // a foto manda (vida/estado salvos)
  });
});
