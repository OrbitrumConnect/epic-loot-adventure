import fs from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { useGameStore } from '@/game/state/game-store';
import { weaponFor } from '@/game/data/weapons';

/* Pedro, 25/10: "na câmera de ombro tento atacar com a espada e só consigo colado no inimigo". O clique
   mirava o bicho do CENTRO; fora do alcance → "longe demais" e nem balançava. Agora: centro no alcance → ele;
   senão o mais perto no alcance; ninguém → golpe no AR (animação + som). */
const initial = useGameStore.getState();
afterEach(() => useGameStore.setState(initial, true));

function hold(kind: 'melee' | 'ranged') {
  const st = useGameStore.getState();
  const hb = st.player.inventory.hotbar.slots;
  const idx = hb.findIndex((slot) => slot != null && weaponFor(st.player.inventory.slots[slot]?.itemId).ranged === (kind === 'ranged') && st.player.inventory.slots[slot]?.itemId);
  expect(idx).toBeGreaterThanOrEqual(0);
  useGameStore.setState((s) => ({ ui: { ...s.ui, selectedHotbar: idx } }));
}

describe('espada na câmera de ombro', () => {
  it('golpe no ar com espada: anima (attackTick) e respeita a cadência', () => {
    hold('melee');
    const t0 = useGameStore.getState().attackTick;
    expect(useGameStore.getState().swingAir()).toBe(true);
    expect(useGameStore.getState().attackTick).toBe(t0 + 1);
    expect(useGameStore.getState().swingAir()).toBe(false); // cadência
  });

  it('arma de longe não usa golpe no ar (o tiro no vazio é o fireMiss)', () => {
    hold('ranged');
    expect(useGameStore.getState().swingAir()).toBe(false);
  });

  it('mira: bicho do centro fora do alcance da espada → cai no ataque normal; ombro sem ninguém → golpe no ar', () => {
    const aim = fs.readFileSync('src/components/world/aim.ts', 'utf8');
    expect(aim).toMatch(/if \(meleeOutOfReach\(t\.id\)\) return false;/);
    const idx = fs.readFileSync('src/routes/index.tsx', 'utf8');
    expect(idx).toMatch(/else if \(!\(cameraMode === 'third' && useGameStore\.getState\(\)\.swingAir\(\)\)\)/);
  });
});
