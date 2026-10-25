import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { followYaw, MANUAL_LOOK_MS, noteManualLook, pilotAimId, setPilotAim } from '@/components/world/pilot-aim';

/* Pedro, 25/10: "no modo automático (idle) em 3ª pessoa a câmera deve virar junto pro alvo que atira". */
describe('câmera segue o alvo do piloto', () => {
  it('gira pelo lado mais curto e chega no alvo em ~1 s, sem passar do ponto', () => {
    let yaw = 3; // alvo em −3 (do outro lado do ±π): caminho curto = +0,28 rad, não −6
    const target = -3;
    const first = followYaw(yaw, target, 1 / 60);
    expect(first).toBeGreaterThan(yaw);
    for (let i = 0; i < 60; i++) yaw = followYaw(yaw, target, 1 / 60);
    const d = Math.atan2(Math.sin(yaw - target), Math.cos(yaw - target));
    expect(Math.abs(d)).toBeLessThan(0.01);
  });
  it('alvo vale só enquanto o piloto avisa; mexer o mouse devolve a câmera por 1,5 s', () => {
    const t0 = 1_000_000;
    setPilotAim('wave3_raider_brute_1', t0);
    expect(pilotAimId(t0 + 100)).toBe('wave3_raider_brute_1');
    expect(pilotAimId(t0 + 1300)).toBeNull(); // piloto parou de avisar
    setPilotAim('x', t0 + 2000);
    noteManualLook(t0 + 2000);
    expect(pilotAimId(t0 + 2100)).toBeNull();
    setPilotAim('x', t0 + 2000 + MANUAL_LOOK_MS);
    expect(pilotAimId(t0 + 2000 + MANUAL_LOOK_MS + 1)).toBe('x');
    setPilotAim(null);
    expect(pilotAimId(t0 + 4000)).toBeNull();
  });
  it('ligado: piloto avisa o alvo, câmera de 3ª pessoa gira (fora da mira de ombro)', () => {
    const ap = fs.readFileSync('src/components/world/auto-pilot.tsx', 'utf8');
    expect(ap).toMatch(/setPilotAim\(intent\.kind === 'attack' \? intent\.creatureId : null, now\)/);
    const gw = fs.readFileSync('src/components/game-world.tsx', 'utf8');
    expect(gw).toMatch(/const aimId = aiming \? null : pilotAimId\(\);/);
    expect(gw).toMatch(/cameraYaw\.current = followYaw\(cameraYaw\.current, Math\.atan2\(aimC\.position\.x - px, aimC\.position\.z - pz\), delta\)/);
  });
});
