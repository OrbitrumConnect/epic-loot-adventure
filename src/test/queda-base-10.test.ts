import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { baseFallLevelLoss } from '@/game/systems/progressionSystem';

/* Pedro, 25/10 ("go all"): perda na queda da base = 10% do nível (mín. 5, máx. 15) + aviso na brecha; bicho do
   mapa não quebra muro (só a horda). */
describe('queda da base: perda escalada', () => {
  it('10% do nível, mínimo 5, máximo 15', () => {
    expect(baseFallLevelLoss(1)).toBe(5);
    expect(baseFallLevelLoss(20)).toBe(5);
    expect(baseFallLevelLoss(50)).toBe(5);
    expect(baseFallLevelLoss(80)).toBe(8);
    expect(baseFallLevelLoss(125)).toBe(13);
    expect(baseFallLevelLoss(250)).toBe(15);
  });
  it('a queda usa a regra, a tela mostra o número real e a brecha avisa', () => {
    const store = fs.readFileSync('src/game/state/game-store.ts', 'utf8');
    expect(store).toMatch(/const levelLoss = baseFallLevelLoss\(state\.player\.level\);/);
    expect(store).toMatch(/Brecha no muro! A base está aberta — se o núcleo cair: −\$\{baseFallLevelLoss\(state\.player\.level\)\} níveis/);
    expect(fs.readFileSync('src/routes/index.tsx', 'utf8')).toMatch(/Você perdeu \{ui\.baseFellLoss \?\? 5\} níveis/);
  });
  it('perseguindo perto da base: só a HORDA bate no muro', () => {
    const ai = fs.readFileSync('src/components/world/hostile-ai.ts', 'utf8');
    expect(ai).toMatch(/const hit = creatureId\.startsWith\('wave'\) \? nearestBasePiece\(wx, wz\) : null;/);
  });
});
