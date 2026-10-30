import { describe, expect, it } from 'vitest';
import { canOpenGlider, GLIDE, glideStep, newGlide, newSkate, SKATE, skateStep } from '@/components/zona-sul/zs-glide';

const dt = 1 / 30;
const run = (n: number, f: () => void) => { for (let i = 0; i < n; i++) f(); };

describe('asa-delta (nível 8)', () => {
  it('abre só caindo de lugar alto (não abre no chão nem pulando baixinho)', () => {
    expect(canOpenGlider(-3, 10)).toBe(true);
    expect(canOpenGlider(-3, 1)).toBe(false);   // perto do chão
    expect(canOpenGlider(2, 10)).toBe(false);   // ainda subindo no pulo
  });
  it('planeio de cruzeiro: ~10 m pra frente por metro perdido (asa-delta de verdade: 8–12)', () => {
    const s = newGlide(0, 300);
    let dist = 0;
    run(300, () => { const r = glideStep(s, { steer: 0, pitch: 0 }, 0, dt); dist += Math.hypot(r.dx, r.dz); });
    const ratio = dist / (300 - s.y);
    expect(ratio).toBeGreaterThan(8); expect(ratio).toBeLessThan(12);
  });
  it('W mergulha (mais rápido, perde mais altura); S empina até estolar (afunda forte)', () => {
    const dive = newGlide(0, 300), trim = newGlide(0, 300), flare = newGlide(0, 300);
    run(120, () => { glideStep(dive, { steer: 0, pitch: 1 }, 0, dt); glideStep(trim, { steer: 0, pitch: 0 }, 0, dt); glideStep(flare, { steer: 0, pitch: -1 }, 0, dt); });
    expect(dive.speed).toBeGreaterThan(trim.speed + 5);
    expect(dive.y).toBeLessThan(trim.y);
    expect(flare.stalled).toBe(true);
    expect(flare.y).toBeLessThan(trim.y);
  });
  it('A/D inclina e vira; pousa ao chegar no chão', () => {
    const s = newGlide(0, 20);
    run(60, () => glideStep(s, { steer: 1, pitch: 0 }, 0, dt));
    expect(s.bank).toBeGreaterThan(0.5); expect(s.yaw).toBeLessThan(-0.5);
    let landed = false;
    for (let i = 0; i < 2000 && !landed; i++) landed = glideStep(s, { steer: 0, pitch: 0 }, 0, dt).landed;
    expect(landed).toBe(true);
    expect(s.y).toBeLessThanOrEqual(GLIDE.LAND_AGL + 0.1);
  });
});

describe('skate voador (nível 15)', () => {
  const flat = () => 0, flatSlope = () => 0;
  it('flutua 35 cm, acelera até 9 m/s, turbo 15, freia', () => {
    const s = newSkate(0, 0.35);
    let x = 0, z = 0;
    run(90, () => { ({ x, z } = skateStep(s, { throttle: 1, steer: 0, turbo: false, hop: false }, x, z, dt, flat, flatSlope)); });
    expect(s.speed).toBeCloseTo(SKATE.MAX, 1);
    expect(s.y).toBeCloseTo(SKATE.HOVER, 2);
    run(60, () => { ({ x, z } = skateStep(s, { throttle: 1, steer: 0, turbo: true, hop: false }, x, z, dt, flat, flatSlope)); });
    expect(s.speed).toBeCloseTo(SKATE.TURBO, 1);
    run(60, () => { ({ x, z } = skateStep(s, { throttle: -1, steer: 0, turbo: false, hop: false }, x, z, dt, flat, flatSlope)); });
    expect(s.speed).toBeLessThan(0.5);
  });
  it('passa por cima da ÁGUA (flutua na superfície)', () => {
    const water = (x: number) => (x > 5 ? 0 : 1); // chão a 1 m, depois mar (superfície 0)
    const s = newSkate(Math.PI / 2, 1.35);
    let x = 0, z = 0;
    run(150, () => { ({ x, z } = skateStep(s, { throttle: 1, steer: 0, turbo: false, hop: false }, x, z, dt, water, flatSlope)); });
    expect(x).toBeGreaterThan(10);
    expect(s.y).toBeCloseTo(SKATE.HOVER, 1);
  });
  it('não escala parede (> 35°); pulinho sobe e volta', () => {
    const wall = (x: number) => (x > 3 ? 10 : 0), wallSlope = (x: number) => (x > 3 ? 70 : 0);
    const s = newSkate(Math.PI / 2, 0.35);
    let x = 0, z = 0;
    run(120, () => { ({ x, z } = skateStep(s, { throttle: 1, steer: 0, turbo: false, hop: false }, x, z, dt, wall, wallSlope)); });
    expect(x).toBeLessThan(3.5);
    const h = newSkate(0, 0.35); let hx = 0, hz = 0, top = 0;
    ({ x: hx, z: hz } = skateStep(h, { throttle: 0, steer: 0, turbo: false, hop: true }, hx, hz, dt, flat, flatSlope));
    run(40, () => { ({ x: hx, z: hz } = skateStep(h, { throttle: 0, steer: 0, turbo: false, hop: false }, hx, hz, dt, flat, flatSlope)); top = Math.max(top, h.y); });
    expect(top).toBeGreaterThan(1); expect(h.y).toBeCloseTo(SKATE.HOVER, 2);
  });
});

describe('kit de mobilidade no loot (prancha 5, asa-delta 8, skate 15)', () => {
  it('os três entram juntos, são fixos (não descarta) e liberam no nível certo', async () => {
    const { grantMobilityKit, isMobilityItem, MOBILITY_IDS } = await import('@/game/systems/zonaSulKit');
    const { createInventory } = await import('@/game/systems/inventorySystem');
    const { unlockLevel } = await import('@/game/systems/unlockSystem');
    const { ITEMS } = await import('@/game/data/items');
    const r = grantMobilityKit(createInventory());
    expect(r.granted).toEqual([...MOBILITY_IDS]);
    for (const id of MOBILITY_IDS) {
      expect(r.inventory.slots.some((s) => s.itemId === id)).toBe(true);
      expect(ITEMS[id]!.weight).toBe(0);
      expect(isMobilityItem(id)).toBe(true);
    }
    expect([unlockLevel('surfboard'), unlockLevel('hang_glider'), unlockLevel('hover_skate')]).toEqual([5, 8, 15]);
    expect(grantMobilityKit(r.inventory).granted).toEqual([]); // idempotente
    const { useGameStore } = await import('@/game/state/game-store');
    useGameStore.setState((s) => ({ player: { ...s.player, inventory: r.inventory } }));
    const idx = r.inventory.slots.findIndex((s) => s.itemId === 'hang_glider');
    useGameStore.getState().dropItem(idx);
    expect(useGameStore.getState().player.inventory.slots[idx]?.itemId).toBe('hang_glider');
  });
});

describe('rasante e manobras (Pedro 30/10)', () => {
  it('asa: RASANTE (W) inclina o bico pra baixo e desce rápido; S com velocidade sobrando SOBE (pull-up)', () => {
    const s = newGlide(0, 300);
    run(90, () => glideStep(s, { steer: 0, pitch: 1 }, 0, dt));
    expect(s.pitch).toBeGreaterThan(0.4); // bico pra baixo
    expect(s.speed).toBeGreaterThan(GLIDE.CRUISE + 8);
    const yLow = s.y;
    run(30, () => glideStep(s, { steer: 0, pitch: -1 }, 0, dt));
    expect(s.y).toBeGreaterThan(yLow); // trocou velocidade por altura
    expect(s.pitch).toBeLessThan(0);   // bico pra cima
  });
  it('skate: 2º pulo no AR é mais alto e dá kickflip; A/D no ar gira 360 e o pouso nomeia a manobra', () => {
    const flat = () => 0, flatSlope = () => 0;
    const one = newSkate(0, 0.35); let x = 0, z = 0, top1 = 0;
    ({ x, z } = skateStep(one, { throttle: 0, steer: 0, turbo: false, hop: true }, x, z, dt, flat, flatSlope));
    run(60, () => { ({ x, z } = skateStep(one, { throttle: 0, steer: 0, turbo: false, hop: false }, x, z, dt, flat, flatSlope)); top1 = Math.max(top1, one.y); });
    const two = newSkate(0, 0.35); let top2 = 0, sawFlip = false;
    ({ x, z } = skateStep(two, { throttle: 0, steer: 0, turbo: false, hop: true }, x, z, dt, flat, flatSlope));
    run(8, () => { ({ x, z } = skateStep(two, { throttle: 0, steer: 0, turbo: false, hop: false }, x, z, dt, flat, flatSlope)); });
    ({ x, z } = skateStep(two, { throttle: 0, steer: 0, turbo: false, hop: true }, x, z, dt, flat, flatSlope)); // 2º pulo
    run(90, () => { ({ x, z } = skateStep(two, { throttle: 0, steer: 1, turbo: false, hop: false }, x, z, dt, flat, flatSlope)); top2 = Math.max(top2, two.y); if (two.flip > 0) sawFlip = true; });
    expect(top2).toBeGreaterThan(top1 + 0.5);
    expect(sawFlip).toBe(true);
    expect(two.air).toBe(false);
    expect(two.trick).toMatch(/kickflip/);
    expect(two.trick).toMatch(/^\d+/); // girou (360/540/720…)
  });
});
