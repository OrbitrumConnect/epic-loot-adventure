import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { freeShotPoint, heroFacing, setIsoCursor } from '@/components/world/free-aim';
import { useGameStore } from '@/game/state/game-store';
import { weaponRangeFor } from '@/game/data/weapons';

/* Pedro, 26/10: "só consigo atirar quando estou perto de inimigos no manual; tiro livre, fluido, o tiro precisa
   pegar"; "qualquer bicho que eu atacar luta, né?". */
describe('tiro livre', () => {
  it('PC (câmera de cima): no cursor; celular ou mouse parado: pra onde o herói olha — sempre no limite do alcance', () => {
    heroFacing.yaw = 0; // olhando +Z
    setIsoCursor(10, 0, 1000); // cursor a leste
    const pc = freeShotPoint({ x: 0, z: 0 }, 20, true, 2000);
    expect(pc.x).toBeCloseTo(20, 5); expect(pc.z).toBeCloseTo(0, 5);
    const old = freeShotPoint({ x: 0, z: 0 }, 20, true, 1000 + 5000); // mouse parado > 4 s
    expect(old.z).toBeCloseTo(20, 5);
    const mobile = freeShotPoint({ x: 0, z: 0 }, 20, false, 2000);
    expect(mobile.x).toBeCloseTo(0, 5); expect(mobile.z).toBeCloseTo(20, 5);
  });

  it('alvo ALÉM do alcance: o tiro sai (1 bala), na direção dele, e cai no limite do alcance', () => {
    const st = useGameStore.getState();
    const slots = st.player.inventory.slots.slice();
    const gun = slots.findIndex((s) => !s?.itemId);
    slots[gun] = { itemId: 'pistol', quantity: 1 };
    const am = slots.findIndex((s, i) => !s?.itemId && i !== gun);
    slots[am] = { itemId: 'ammo', quantity: 50 };
    const hotbar = st.player.inventory.hotbar.slots.slice();
    hotbar[0] = gun;
    const far = { ...st.creatures.find((c) => c.behavior !== 'dead')!, id: 'longe_1', position: { x: 60, z: 0 }, hp: 50, maxHp: 50, behavior: 'patrol' as const };
    useGameStore.setState({
      player: { ...st.player, dead: false, level: 1, lastAttackAt: 0, position: { x: 0, z: 0 }, inventory: { ...st.player.inventory, slots, hotbar: { ...st.player.inventory.hotbar, slots: hotbar } } },
      ui: { ...st.ui, selectedHotbar: 0 },
      creatures: [far],
      feedback: [],
    });
    const ammo = () => useGameStore.getState().player.inventory.slots.reduce((a, s) => a + (s?.itemId === 'ammo' ? s.quantity : 0), 0);
    const before = ammo();
    useGameStore.getState().attack('longe_1');
    expect(ammo()).toBe(before - 1);                                      // atirou
    expect(useGameStore.getState().creatures[0]!.hp).toBe(50);            // sem dano
    const shot = useGameStore.getState().feedback.find((e) => e.kind === 'shot')!;
    expect(shot.to!.x).toBeCloseTo(weaponRangeFor('pistol', 1), 3);      // cai no limite do alcance, rumo ao alvo
    expect(shot.to!.z).toBeCloseTo(0, 3);
  });

  it('ligado: ATACAR sem alvo atira livre; celular na 3ª pessoa atira no centro da mira; bicho ferido reage de 30 m', () => {
    const idx = fs.readFileSync('src/routes/index.tsx', 'utf8');
    expect(idx).toMatch(/else if \(weaponFor\(heldId\)\.ranged\) useGameStore\.getState\(\)\.fireMiss\(freeShotPoint\(p, range, cameraMode === 'iso' && !zs\)\);/); // Zona Sul: sem câmera de cima (29/10)
    const mc = fs.readFileSync('src/components/world/mobile-controls.tsx', 'utf8');
    expect(mc).toMatch(/if \(!\(\(useAim\.getState\(\)\.active \|\| canAim\) && aimFire\(\)\)\) onAttack\(\);/);
    const ai = fs.readFileSync('src/components/world/hostile-ai.ts', 'utf8');
    expect(ai).toMatch(/export const PROVOKE_DEFAULT = 30;/);
    expect(ai).toMatch(/const provokeRange = tuning\.provokeRange > 0 \? tuning\.provokeRange : tuning\.peaceful \? 0 : PROVOKE_DEFAULT;/);
  });
});
