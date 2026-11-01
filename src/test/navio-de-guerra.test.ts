import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ballLanding, cannonElevation, cannonSalvo, cannonSide, findWarshipDock, hullFits, newWarship, WARSHIP, warshipStep } from '@/components/zona-sul/zs-warship';
import { isUnlocked, UNLOCK_LEVEL } from '@/game/systems/unlockSystem';

/* NAVIO DE GUERRA (Pedro 01/11: "pega acima do nível 70; ataca com bola de canhão, mirando"). */
describe('navio de guerra — dirigir', () => {
  // mar fundo pra z > 50 (praia/raso antes)
  const sea = (x: number, z: number) => z > 50 && Math.abs(x) < 2000;
  it('libera no nível 70 (fonte única)', () => {
    expect(UNLOCK_LEVEL['war_ship']).toBe(70);
    expect(isUnlocked('war_ship', 69)).toBe(false);
    expect(isUnlocked('war_ship', 70)).toBe(true);
  });
  it('vela acelera devagar até ~32 km/h; leme só vira andando', () => {
    const s = newWarship(0, 200, 0);
    warshipStep(sea, s, { throttle: 0, steer: 1 }, 1);
    expect(s.yaw).toBe(0); // parado não gira no lugar
    for (let i = 0; i < 60 * 30; i++) warshipStep(sea, s, { throttle: 1, steer: 0 }, 1 / 60);
    expect(s.speed).toBeGreaterThan(WARSHIP.MAX * 0.9);
    expect(s.speed).toBeLessThanOrEqual(WARSHIP.MAX + 1e-6);
    const y0 = s.yaw;
    for (let i = 0; i < 60 * 3; i++) warshipStep(sea, s, { throttle: 1, steer: 1 }, 1 / 60);
    expect(Math.abs(s.yaw - y0)).toBeGreaterThan(0.3);
  });
  it('nunca encalha: rumo à praia ele para na beira do mar fundo (casco inteiro na água)', () => {
    const s = newWarship(0, 120, Math.PI); // proa pra praia (−z)
    for (let i = 0; i < 60 * 40; i++) warshipStep(sea, s, { throttle: 1, steer: 0 }, 1 / 60);
    expect(hullFits(sea, s.x, s.z, s.yaw)).toBe(true);
    expect(s.z - WARSHIP.LENGTH / 2).toBeGreaterThan(50);
  });
  it('ancoragem: o ponto mais perto onde o casco cabe', () => {
    const d = findWarshipDock(sea, { x: 0, z: 40 })!;
    expect(hullFits(sea, d.x, d.z, d.yaw)).toBe(true);
    expect(Math.hypot(d.x, d.z - 40)).toBeLessThan(60);
  });
});

describe('navio de guerra — canhões', () => {
  it('o costado sai de pra onde a câmera olha (boreste = direita do navio)', () => {
    // navio pra +z: direita = −x (frente (sin, cos) → direita (cos, −sin) = (1, 0)? yaw 0 → (1, −0) = +x)
    expect(cannonSide(0, Math.PI / 2)).toBe('starboard'); // olhando pra +x
    expect(cannonSide(0, -Math.PI / 2)).toBe('port');     // olhando pra −x
  });
  it('mais inclinação da câmera = mais longe (alcance de ~25 m a centenas de m)', () => {
    const s = newWarship(0, 0, 0), flat = () => 0;
    const dist = (pitch: number) => { const b = cannonSalvo(s, 'starboard', cannonElevation(pitch), 4)[1]!; const l = ballLanding(b, flat); return Math.hypot(l.x, l.z); };
    const near = dist(0.05), mid = dist(0.5), far = dist(0.95);
    expect(near).toBeLessThan(mid);
    expect(mid).toBeLessThan(far);
    expect(near).toBeGreaterThan(15);
    expect(far).toBeGreaterThan(200);
  });
  it('salva de 3 balas do costado escolhido, espalhadas ao longo do navio, pra fora dele', () => {
    const s = newWarship(10, 20, 0);
    const salvo = cannonSalvo(s, 'starboard', 0.2, 4);
    expect(salvo).toHaveLength(WARSHIP.SALVO);
    for (const b of salvo) expect(b.vx).toBeGreaterThan(0); // boreste do navio pra +z = +x
    expect(new Set(salvo.map((b) => b.oz)).size).toBe(WARSHIP.SALVO);
    for (const b of cannonSalvo(s, 'port', 0.2, 4)) expect(b.vx).toBeLessThan(0);
  });
  it('no jogo: E embarca (cadeado antes do 70), clique = salva, botão direito = mira, impacto = dano em área', () => {
    const zs = fs.readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8');
    expect(zs).toMatch(/if \(!isUnlocked\(WARSHIP\.UNLOCK_ID, lvl\)\) useGameStore\.getState\(\)\.setMessage\(lockedMessage\('O navio de guerra', WARSHIP\.UNLOCK_ID\)\);/);
    expect(zs).toMatch(/if \(drive\.mode === 'sailing' && !zsPause\.on\) \{ input\.cannonFire = 'aim'; return; \}/);
    expect(zs).toMatch(/if \(e\.button === 2 && drive\.mode === 'sailing'\) \{ input\.cannonAim = true; return; \}/);
    expect(zs).toMatch(/ship\.reload\[sd\] = WARSHIP\.RELOAD_S;/);
    const view = fs.readFileSync('src/components/zona-sul/zs-warship-view.tsx', 'utf8');
    expect(view).toMatch(/useGameStore\.getState\(\)\.cannonHit\(\{ x: fb\.land\.x, z: fb\.land\.z \}, WARSHIP\.SPLASH_R\);/);
    const store = fs.readFileSync('src/game/state/game-store.ts', 'utf8');
    expect(store).toMatch(/cannonHit: \(at, radius\) => \{/);
    expect(store).toMatch(/rewardCreatureDeath\(c, updatedPlayer, updatedBags, drafts, Math\.random\)/);
    // tubarão não morde quem está no convés (só quem está na altura da água)
    const ai = fs.readFileSync('src/components/world/hostile-ai.ts', 'utf8');
    expect(ai).toMatch(/export const AQUATIC_REACH_UP = 1\.2;/);
  });
});
