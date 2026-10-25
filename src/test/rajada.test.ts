import fs from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  BURST_GAP, burstActive, burstPause, burstSize, cancelBurst, shotCooldown, startBurst, tickBurst,
} from '@/game/systems/burstSystem';
import { useGameStore } from '@/game/state/game-store';

/* Pedro, 25/10: "arma semiautomática de rajada, 6 a 9 tiros, intervalo leve de ~1 s baixando com o nível; o herói
   também. Pistola segue tiro único." */
describe('rajada do rifle', () => {
  beforeEach(() => cancelBurst());

  it('tamanho 6 → 9 com o nível; pausa 1 s → 0,6 s; pistola/arco = tiro único', () => {
    expect(burstSize('rifle', 1)).toBe(6);
    expect(burstSize('rifle', 50)).toBe(7);
    expect(burstSize('rifle', 137)).toBe(8);
    expect(burstSize('rifle', 400)).toBe(9);
    expect(burstSize('pistol', 300)).toBe(1);
    expect(burstSize('bow', 300)).toBe(1);
    expect(burstSize(null, 300)).toBe(1);
    expect(burstPause(1)).toBeCloseTo(0.997, 3);
    expect(burstPause(150)).toBeCloseTo(0.6, 5);
    expect(burstPause(999)).toBeCloseTo(0.6, 5);
  });
  it('cadência: dentro da rajada intervalo curto; gatilho novo espera a pausa; pistola igual antes', () => {
    expect(shotCooldown(0.8, 'rifle', 1, true)).toBeLessThan(BURST_GAP);
    expect(shotCooldown(0.8, 'rifle', 1, false)).toBeCloseTo(burstPause(1), 5);
    expect(shotCooldown(0.5, 'pistol', 200, false)).toBe(0.5);
    expect(shotCooldown(0.5, 'pistol', 200, true)).toBe(0.5);
  });
  it('um gatilho solta o resto da rajada no relógio; para se o tiro não sair', () => {
    let shots = 0;
    startBurst(6, () => { shots++; return true; }, 0);
    for (let t = 0; t <= 1000; t += 16) tickBurst(t);
    expect(shots).toBe(5); // + o 1º, que já saiu no gatilho = 6
    expect(burstActive()).toBe(false);
    let n = 0;
    startBurst(6, () => { n++; return n < 2; }, 0); // 2º tiro falhou (alvo morreu/sem bala)
    for (let t = 0; t <= 1000; t += 16) tickBurst(t);
    expect(n).toBe(2);
    expect(burstActive()).toBe(false);
  });
  it('no store: rifle na mão abre a rajada e cada tiro gasta 1 bala pelo caminho normal', () => {
    const st = useGameStore.getState();
    const slots = st.player.inventory.slots.slice();
    const rifleSlot = slots.findIndex((s) => !s?.itemId);
    slots[rifleSlot] = { itemId: 'rifle', quantity: 1 };
    const ammoSlot = slots.findIndex((s, i) => !s?.itemId && i !== rifleSlot);
    slots[ammoSlot] = { itemId: 'ammo', quantity: 100 };
    const hotbar = st.player.inventory.hotbar.slots.slice();
    hotbar[0] = rifleSlot;
    useGameStore.setState({
      player: { ...st.player, level: 1, dead: false, lastAttackAt: 0, inventory: { ...st.player.inventory, slots, hotbar: { ...st.player.inventory.hotbar, slots: hotbar } } },
      ui: { ...st.ui, selectedHotbar: 0 },
    });
    const ammo = () => useGameStore.getState().player.inventory.slots.reduce((a, s) => a + (s?.itemId === 'ammo' ? s.quantity : 0), 0);
    const before = ammo();
    expect(useGameStore.getState().fireMiss({ x: 10, z: 10 })).toBe(true);
    expect(burstActive()).toBe(true);
    expect(ammo()).toBe(before - 1);
    // Clique de novo no meio da rajada = engolido (não abre outra nem gasta).
    useGameStore.getState().fireMiss({ x: 10, z: 10 });
    expect(ammo()).toBe(before - 1);
  });
  it('ligado: ataque e tiro no vazio abrem a rajada; ticker no mundo (pausa corta)', () => {
    const store = fs.readFileSync('src/game/state/game-store.ts', 'utf8');
    expect(store.match(/startBurst\(burstN, /g)!.length).toBe(2);
    const gw = fs.readFileSync('src/components/game-world.tsx', 'utf8');
    expect(gw).toMatch(/<BurstRuntime paused=\{Boolean\(props\.paused\)\} \/>/);
  });
});
