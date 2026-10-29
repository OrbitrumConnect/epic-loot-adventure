import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { canPop, newRide, RIDE, rideStep } from '@/components/zona-sul/surf/surf-ride';
import { barrelAt, barrelBand, crestQ, SPIT_ACC, SURF, surfChurnAt, surfSpitAt, TUBE, type WaveVar, waveStateAt } from '@/components/zona-sul/surf/surf-wave';
import { readZsLoot, zsAssignHotbar, ZS_BOARD_ID, zsLootFrom, zsSelectedItem } from '@/components/zona-sul/zs-loot';
import { SAVE_KEY } from '@/game/systems/persistenceSystem';

/* 28/10 — SURF fase C (Pedro): hotbar + I com o mesmo loot do jogo + PRANCHA num slot; remada → levantar (Zombie Stand
   Up de 30%) → em pé surfando; "caso eu caia dentro do tubo, giro junto e vou sendo levado". */
const src = (f: string) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const AX = { qx: 0, qz: 1, sx: 1, sz: 0 };                     // q = +z (praia), s = +x
const C = SURF.C, dt = 1 / 30;
const run = (st: ReturnType<typeof newRide>, s: number, inp: Partial<Parameters<typeof rideStep>[1]>, w: Partial<Parameters<typeof rideStep>[2]>) => {
  let x = 0, z = 0;
  for (let k = 0; k < Math.round(s / dt); k++) { const d = rideStep(st, { dirX: 0, dirZ: 0, pop: false, fast: false, ...inp }, { pushX: 0, pushZ: 0, churn: 0, ...w }, AX, C, dt); x += d.dx; z += d.dz; }
  return { x, z };
};

describe('prancha — remar, levantar, surfar, vaca', () => {
  it('remando: mais rápido que nadar; sem onda o ESPAÇO não levanta', () => {
    const st = newRide();
    const m = run(st, 3, { dirZ: 1 }, {});
    expect(m.z / 3).toBeGreaterThan(2.4);                          // nado normal: 2,4 m/s
    expect(canPop(st, { pushX: 0, pushZ: 0.5, churn: 0 }, C)).toBe(false);
    run(st, 0.2, { pop: true }, { pushZ: 0.5 });
    expect(st.mode).toBe('paddle');
  });
  it('a onda pegou → ESPAÇO levanta (≈ 1 s, levado pela onda) → em pé', () => {
    const st = newRide();
    run(st, dt, { pop: true }, { pushZ: C });
    expect(st.mode).toBe('popup');
    const m = run(st, RIDE.POPUP_S + 0.05, {}, { pushZ: C });
    expect(st.mode).toBe('ride');
    expect(m.z).toBeGreaterThan(C * RIDE.POPUP_S * 0.9);           // levantando, a onda leva
  });
  it('CARVING com comandos DA PRANCHA: D vira à DIREITA de quem está nela, A à esquerda, com raio; a onda leva no bolso', () => {
    const st = newRide(); st.mode = 'ride'; st.yaw = 0; st.speed = RIDE.S_CRUISE; // indo pra +z: a direita dele é −x
    run(st, 0.2, { steer: 1 }, { pushZ: C, surfY: 0 });
    expect(st.yaw).toBeLessThan(-0.3); expect(st.yaw).toBeGreaterThan(-Math.PI / 2 + 0.2); // virando, ainda não chegou
    expect(st.carve).toBeLessThan(-1);                              // taxa de curva (inclina o corpo)
    run(st, (Math.PI / 2 - 0.52) / RIDE.TURN, { steer: 1 }, { pushZ: C, surfY: 0 });
    const m = run(st, 3, {}, { pushZ: C, surfY: 0 });                // soltou: segue reto
    expect(st.yaw).toBeCloseTo(-Math.PI / 2, 1);
    expect(m.x).toBeLessThan(-RIDE.S_CRUISE * 2);                    // foi pra DIREITA dele (−x)
    expect(m.z).toBeGreaterThan(C * 3 * 0.9);                       // e a onda segura no bolso
    const a = newRide(); a.mode = 'ride'; a.yaw = 0; a.speed = RIDE.S_CRUISE;
    run(a, 0.3, { steer: -1 }, { pushZ: C, surfY: 0 });
    expect(a.yaw).toBeGreaterThan(0.3);                              // A = esquerda (+x)
    // nada disso depende da câmera: dirX/dirZ (câmera) não mexem na prancha em pé
    const cam = newRide(); cam.mode = 'ride'; cam.yaw = 0; cam.speed = RIDE.S_CRUISE;
    run(cam, 0.5, { dirX: 1, dirZ: 0 }, { pushZ: C, surfY: 0 });
    expect(cam.yaw).toBe(0);
  });
  it('toque no Shift em pé = boost leve (+~2 km/h na hora), com respiro (segurar não vira turbo)', () => {
    const b = newRide(); b.mode = 'ride'; b.speed = RIDE.S_CRUISE;
    rideStep(b, { dirX: 0, dirZ: 0, pop: false, fast: true, boost: true }, { pushX: 0, pushZ: C, churn: 0, surfY: 0 }, AX, C, dt);
    expect((b.speed - RIDE.S_CRUISE) * 3.6).toBeGreaterThan(1.5); expect((b.speed - RIDE.S_CRUISE) * 3.6).toBeLessThan(2.5);
    const s1 = b.speed;
    rideStep(b, { dirX: 0, dirZ: 0, pop: false, fast: true, boost: true }, { pushX: 0, pushZ: C, churn: 0, surfY: 0 }, AX, C, dt);
    expect(b.speed - s1).toBeLessThan(RIDE.BOOST * 0.5);              // dentro do respiro: o toque não soma de novo (só o pump do Shift segurado)
  });
  it('W acelera (pump), S freia (stall)', () => {
    const w = newRide(); w.mode = 'ride'; w.speed = RIDE.S_CRUISE;
    run(w, 1.5, { throttle: 1 }, { pushZ: C, surfY: 0 });
    const s2 = newRide(); s2.mode = 'ride'; s2.speed = 8;
    run(s2, 1, { throttle: -1 }, { pushZ: C, surfY: 0 });
    expect(w.speed).toBeGreaterThan(RIDE.S_CRUISE + 1); expect(s2.speed).toBeLessThan(5);
  });
  it('a face é RAMPA: descendo ganha velocidade (dá pra passar da abertura do tubo), subindo perde; W = pump', () => {
    const down = newRide(); down.mode = 'ride'; down.yaw = 0; down.speed = RIDE.S_CRUISE;
    run(down, 1.5, { dirZ: 1 }, { pushZ: C, surfY: 0, gradZ: -0.8 });  // face desce rumo à praia (+z)
    expect(down.speed).toBeGreaterThan(SURF.V_PEEL);                // mais rápido que a abertura (6,5 m/s)
    const up = newRide(); up.mode = 'ride'; up.yaw = Math.PI; up.speed = 8;
    run(up, 0.6, { dirZ: -1 }, { pushZ: C, surfY: 0, gradZ: -0.8 }); // subindo a face
    expect(up.speed).toBeLessThan(6);
    const pump = newRide(); pump.mode = 'ride'; pump.speed = RIDE.S_CRUISE;
    run(pump, 2, { throttle: 1 }, { pushZ: C, surfY: 0 });                  // W = pump
    expect(pump.speed).toBeGreaterThan(RIDE.S_CRUISE + 1);
  });
  it('AÉREO: subindo rápido e passando o lip decola; no ar A/D gira; pousa limpo (aéreo 360!) ou torto (vaca)', () => {
    const fly = (spinS: number) => {
      const st = newRide(); st.mode = 'ride'; st.yaw = Math.PI; st.speed = 9; // rumo à crista (pro mar = −z)
      let y = 0;
      for (let k = 0; k < 24; k++) { y += 3.5 * dt; rideStep(st, { dirX: 0, dirZ: -1, pop: false, fast: false }, { pushX: 0, pushZ: C, churn: 0, surfY: y, gradZ: 0.9 }, AX, C, dt); }
      rideStep(st, { dirX: 0, dirZ: -1, pop: false, fast: false }, { pushX: 0, pushZ: C, churn: 0, surfY: y - 0.2, gradZ: -0.5 }, AX, C, dt); // passou o lip
      expect(st.air).toBe(true);
      let maxY = 0, k = 0;
      for (; k < 200 && st.air; k++) { rideStep(st, { dirX: 0, dirZ: 0, pop: false, fast: false, steer: k * dt < spinS ? 1 : 0 }, { pushX: 0, pushZ: C, churn: 0, surfY: 0.5 }, AX, C, dt); maxY = Math.max(maxY, st.y); }
      expect(maxY).toBeGreaterThan(y + 0.8);                          // voou de verdade
      return st;
    };
    const straight = fly(0);
    expect(straight.mode).toBe('ride'); expect(straight.trick).toBe('aéreo!'); expect(straight.airs).toBe(1);
    const spun = fly((2 * Math.PI) / RIDE.AIR_SPIN);                 // gira 360°
    expect(spun.mode).toBe('ride'); expect(spun.trick).toBe('aéreo 360!');
    const bad = fly((Math.PI / 2) / RIDE.AIR_SPIN);                  // 90°: pousa de lado
    expect(bad.mode).toBe('wipe');
  });
  it('perdeu a onda (sem correnteza) → deita e volta a remar', () => {
    const st = newRide(); st.mode = 'ride';
    run(st, RIDE.LOSE_S + 0.1, {}, {});
    expect(st.mode).toBe('paddle');
  });
  it('VACA: a onda fechou em cima → gira junto e é levado, sem controle; depois volta a remar', () => {
    const st = newRide(); st.mode = 'ride';
    const m = run(st, 1, { dirX: 1 }, { pushZ: C, churn: 0.9 });
    expect(st.mode).toBe('wipe');
    expect(st.spin).toBeGreaterThan(RIDE.WIPE_SPIN * 0.8);          // girando
    expect(Math.abs(m.x)).toBeLessThan(0.5);                        // sem controle (o "pra direita" não vale)
    expect(m.z).toBeGreaterThan(C * 0.9);                           // levado junto com a espuma
    run(st, RIDE.WIPE_S, {}, { pushZ: C, churn: 0 });
    expect(st.mode).toBe('paddle');
  });
  it('espuma só derruba onde a onda FECHOU: na frente da abertura (tubo aberto) não', () => {
    const V: WaveVar = { hR: 1, hL: 1, vR: 1, vL: 1 };
    const st = waveStateAt((SURF.BREAK_Q - SURF.Q_MIN) / SURF.C + 8, V), R = barrelBand(st.h).r;
    expect(surfChurnAt(0, crestQ(st, 0) + R, [st], [V])).toBeGreaterThan(RIDE.WIPE_CHURN); // pico: já fechou
    const sOpen = -(st.peelL - 3);                                   // perto da frente da abertura: tubo aberto
    expect(barrelAt(sOpen, st, V).closed).toBe(0);
    expect(surfChurnAt(sOpen, crestQ(st, sOpen) + R, [st], [V])).toBe(0);
  });
});

describe('hotbar + I na Zona Sul: o MESMO loot, só leitura', () => {
  const inv = { slots: [{ itemId: 'stone_axe', quantity: 1 }, { itemId: null, quantity: 0 }, { itemId: 'wood', quantity: 12 }], hotbar: { slots: [0, 2, null] } };
  it('copia o inventário (hotbar remapeado) e põe a PRANCHA no fim; pôr no hotbar e selecionar', () => {
    const l = zsLootFrom(inv);
    expect(l.slots.map((s) => s.itemId)).toEqual(['stone_axe', 'wood', ZS_BOARD_ID]);
    expect(l.hotbar.slice(0, 3)).toEqual([0, 1, null]);
    expect(l.hotbar).toHaveLength(10);
    const l2 = zsAssignHotbar(l, 2, 2);
    expect(zsSelectedItem(l2, 2)).toBe(ZS_BOARD_ID);
    expect(zsSelectedItem(zsAssignHotbar(l2, 5, 2), 2)).toBe(null); // mesmo item não fica em 2 espaços
  });
  it('NUNCA grava no save do jogo (a prancha faria o save ser recusado)', () => {
    const storage = { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() };
    const l = readZsLoot(storage, inv);
    expect(storage.getItem).toHaveBeenCalledWith(SAVE_KEY);
    expect(storage.setItem).not.toHaveBeenCalled(); expect(storage.removeItem).not.toHaveBeenCalled();
    expect(l.slots.at(-1)!.itemId).toBe(ZS_BOARD_ID);               // sem save: usa o inventário da memória
    const code = src('src/components/zona-sul/zs-loot.ts') + src('src/components/zona-sul/zs-loot-hud.tsx');
    expect(code).not.toMatch(/setItem|startLocalPersistence|startAccountPersistence|useGameStore\.setState/);
  });
  it('o jogo de sempre não usa nada disso (corte de clip é opcional; prancha só existe na Zona Sul)', () => {
    expect(src('src/routes/index.tsx')).not.toMatch(/customClipCut|zs_surfboard/);
    expect(src('src/game/data/items.ts')).not.toMatch(/zs_surfboard/);
  });
});

describe('ondular e baforada (29/10)', () => {
  it('ONDULAR na parede rende velocidade: zigue-zague em cima da face ganha mais que ir reto', () => {
    const zig = newRide(); zig.mode = 'ride'; zig.yaw = -Math.PI / 2 + 0.68; zig.speed = 5; // ondula em volta da linha (±0,68 rad)
    const reto = newRide(); reto.mode = 'ride'; reto.yaw = -Math.PI / 2; reto.speed = 5;
    for (let k = 0; k < 90; k++) {
      const s = Math.sin(k * dt * 6) > 0 ? 1 : -1;               // sobe e desce (curvas alternadas)
      rideStep(zig, { dirX: 0, dirZ: 0, pop: false, fast: false, steer: s }, { pushX: 0, pushZ: C, churn: 0, surfY: 1, gradX: 0, gradZ: -0.7 }, AX, C, dt);
      rideStep(reto, { dirX: 0, dirZ: 0, pop: false, fast: false }, { pushX: 0, pushZ: C, churn: 0, surfY: 1, gradX: 0, gradZ: -0.7 }, AX, C, dt);
    }
    expect(zig.speed).toBeGreaterThan(reto.speed + 0.5);
  });
  it('BAFORADA: dentro do tubo, com o fechamento chegando atrás, a onda cospe pra fora pela boca (velocidade + aviso)', () => {
    expect(RIDE.SPIT_FULL).toBe(SPIT_ACC);
    // ponto dentro do tubo, 2 m antes do fechamento chegar (lado esquerdo: a boca é pra −s)
    const V: WaveVar = { hR: 1, hL: 1, vR: 1, vL: 1 };
    const st = waveStateAt((SURF.BREAK_Q - SURF.Q_MIN) / SURF.C + 10, V);
    const s = -(st.peelL - SURF.CLOSE_LAG + 2), R = barrelBand(barrelAt(s, st, V).hSide).r, q = crestQ(st, s) + TUBE.CQ * R;
    const a = surfSpitAt(s, q, [st], [V], 0.2);
    expect(a).toBeLessThan(-SPIT_ACC * 0.6);                        // rumo à boca (−s), forte
    expect(surfSpitAt(-(st.peelL - 6), crestQ(st, -(st.peelL - 6)) + TUBE.CQ * R, [st], [V], 0.2)).toBe(0); // perto da boca: o fechamento está longe
    const r = newRide(); r.mode = 'ride'; r.yaw = -Math.PI / 2; r.speed = 5; // apontando pra boca (−x = −s)
    rideStep(r, { dirX: 0, dirZ: 0, pop: false, fast: false }, { pushX: 0, pushZ: C, churn: 0, surfY: 0, spitX: a, spitZ: 0 }, AX, C, dt);
    expect(r.speed).toBeGreaterThan(5 + RIDE.SPIT_BURST * 0.9);    // tiro de velocidade
    expect(r.trick).toBe('baforada!');
  });
});
