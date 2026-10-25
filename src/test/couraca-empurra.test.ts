import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { queueKnockback, takeKnockback, pendingKnockback } from '@/game/systems/knockbackSystem';

/* Pedro, 25/10: "a Couraça poderia me dar dano e me empurrar uns 3–4 m, fica mais realista". O golpe dela
   enfileira ~3,5 m pra trás (direção inimigo→herói); o herói consome suave e passa pelas colisões. */
describe('Couraça empurra o herói', () => {
  it('golpe dela empurra 3,5 m (só ela) na direção oposta ao inimigo', () => {
    const ai = fs.readFileSync('src/components/world/hostile-ai.ts', 'utf8');
    expect(ai).toMatch(/PLAYER_SHOVE: Record<string, number> = \{ raider_samurai: 3\.5 \}/);
    expect(ai).toMatch(/queueKnockback\("player", \(\(px - wx\) \/ distToPlayer\) \* shove/);
    const gw = fs.readFileSync('src/components/game-world.tsx', 'utf8');
    expect(gw).toMatch(/const shove = takeKnockback\("player", dt\);\s*if \(shove\) \{ nx \+= shove\.x; nz \+= shove\.z; \}/);
  });

  it('o herói percorre os 3,5 m em ~0,3 s (suave, não teleporta)', () => {
    queueKnockback('player', 3.5, 0);
    let moved = 0, frames = 0, first = 0;
    for (let i = 0; i < 120 && pendingKnockback('player'); i++) {
      const k = takeKnockback('player', 1 / 60)!; moved += k.x; frames++;
      if (i === 0) first = k.x;
    }
    expect(moved).toBeGreaterThan(3.45);
    expect(first).toBeLessThan(0.7);        // 1º quadro: só um pedaço (sem teleporte)
    expect(frames).toBeLessThan(40);        // termina em < ~0,65 s (maior parte nos primeiros 0,3 s)
  });
});

describe('árvores de farm: +1 m e alturas variadas', () => {
  it('altura própria 1,02–1,42× (4,9 m → ~5–7 m), largura 0,95–1,15', () => {
    const src = fs.readFileSync('src/components/world/harvest-nodes.tsx', 'utf8');
    expect(src).toMatch(/const w = \(0\.95 \+ r \* 0\.2\) \* fillK;/);
    // 25/10 (2ª): +32% só na altura (TREE_HEIGHT_K) → ~6,6–9,2 m; largura igual.
    expect(src).toMatch(/dummy\.scale\.set\(w, \(1\.02 \+ rand\(n\.seed \+ 29\) \* 0\.4\) \* fillK \* TREE_HEIGHT_K, w\)/);
    const kit = fs.readFileSync('src/components/world/world-kit.ts', 'utf8');
    expect(kit).toMatch(/export const TREE_HEIGHT_K = 1\.32;/);
    const bb = fs.readFileSync('src/components/world/billboards.tsx', 'utf8');
    expect(bb).toMatch(/h: v === 'bush' \? h : h \* TREE_HEIGHT_K/);
  });
});
