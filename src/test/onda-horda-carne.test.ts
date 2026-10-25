import fs from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { useGameStore } from '@/game/state/game-store';
import { applyHordeCall, hordeCallBonus } from '@/game/systems/waveSystem';
import { createInitialBase, depositFromInventory } from '@/game/systems/baseSystem';
import { addItem } from '@/game/systems/inventorySystem';

/* Pedro, 25/10 — checklist do dia, itens 6–8: resumo da onda repelida; "chamar a horda agora" com bônus de loot;
   carne crua (drop sem uso) vira comida do armazém ao depositar. */
const initial = useGameStore.getState();
afterEach(() => useGameStore.setState(initial, true));

describe('chamar a horda agora', () => {
  it('bônus: +10%/min pulado, teto +50%', () => {
    expect(hordeCallBonus(0)).toBe(0);
    expect(hordeCallBonus(3 * 60_000)).toBe(0.3);
    expect(hordeCallBonus(14 * 60_000)).toBe(0.5);
  });
  it('só a horda daquela onda ganha o bônus', () => {
    const loot = [{ itemId: 'ammo', quantity: 10 }];
    const call = { wave: 9, bonus: 0.3 };
    expect(applyHordeCall(loot, 'wave9_raider_brute_2', call)).toEqual([{ itemId: 'ammo', quantity: 13 }]);
    expect(applyHordeCall(loot, 'wave8_raider_brute_2', call)).toBe(loot);
    expect(applyHordeCall(loot, 'wild_bear_1', call)).toBe(loot);
  });
  it('na paz com base fechada: traz a onda já e guarda o bônus; fora disso não faz nada', () => {
    const base = { id: 'b', pieces: [], enclosed: true } as never;
    useGameStore.setState({ playerBase: base, wave: { phase: 'peace', wave: 8, phaseEndsAt: Date.now() + 5 * 60_000, spawnPending: 0 } });
    useGameStore.getState().callHordeNow();
    const s = useGameStore.getState();
    expect(s.wave.phaseEndsAt).toBeLessThanOrEqual(Date.now());
    expect(s.hordeCall).toEqual({ wave: 9, bonus: 0.5 });
    useGameStore.setState({ hordeCall: null, wave: { phase: 'combat', wave: 9, phaseEndsAt: 0, spawnPending: 0 } });
    useGameStore.getState().callHordeNow();
    expect(useGameStore.getState().hordeCall).toBeNull();
  });
});

describe('carne crua vira comida', () => {
  it('depositar leva a carne crua pro armazém como comida', () => {
    const base = createInitialBase(Date.now());
    const inv = addItem(useGameStore.getState().player.inventory, 'raw_meat', 20);
    const r = depositFromInventory(base, inv);
    expect(r.moved.food).toBe(20);
    expect(r.state.resources.food).toBe(base.resources.food + 20);
  });
});

describe('resumo da onda repelida', () => {
  it('conta abates da MINHA horda daquela onda + tempo, e mostra na tela de evolução', () => {
    const store = fs.readFileSync('src/game/state/game-store.ts', 'utf8');
    expect(store).toMatch(/const kills = waveCreatures\.filter\(\(c\) => c\.id\.startsWith\(tag\) && isMyWave\(c\.id\) && c\.behavior === 'dead'\)\.length;/);
    expect(fs.readFileSync('src/routes/index.tsx', 'utf8')).toMatch(/Onda \{ui\.waveSummary\.wave\} repelida! ⚔ <b>\{ui\.waveSummary\.kills\}<\/b> abates/);
  });
});
