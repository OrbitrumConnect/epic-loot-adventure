import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ballLanding, cannonElevation, cannonSalvo, cannonSide, cannonSwing, findWarshipDock, hullFits, newWarship, WARSHIP, warshipStep } from '@/components/zona-sul/zs-warship';
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
  it('vela acelera até ~43 km/h; leme vira bem andando e um pouco parado (Pedro: "mais leve, tava engessado")', () => {
    expect(WARSHIP.MAX).toBe(12);
    const s = newWarship(0, 200, 0);
    for (let i = 0; i < 60; i++) warshipStep(sea, s, { throttle: 0, steer: 1 }, 1 / 60);
    const parado = Math.abs(s.yaw);
    expect(parado).toBeGreaterThan(0);                 // parado ainda gira um pouco
    expect(parado).toBeLessThan(WARSHIP.TURN * 0.5);   // …bem menos que andando
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
  it('a mira gira pra frente/trás do través seguindo a câmera (até ±50°)', () => {
    const s = newWarship(0, 0, 0); // proa pra +z; boreste = +x
    expect(cannonSwing(s, 'starboard', Math.PI / 2)).toBeCloseTo(0);            // olhando reto pro través
    expect(cannonSwing(s, 'starboard', Math.PI / 2 - 0.5)).toBeCloseTo(-0.5);   // 0,5 rad pra proa
    expect(cannonSwing(s, 'starboard', 0)).toBeCloseTo(-WARSHIP.AIM_SWING);     // olhando pra frente: trava em 50°
    const reto = cannonSalvo(s, 'starboard', 0.2, 4, 0)[1]!, frente = cannonSalvo(s, 'starboard', 0.2, 4, -0.5)[1]!;
    expect(frente.vz).toBeGreaterThan(reto.vz); // girada pra proa (+z)
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
    // 01/11: SUBIR a bordo é livre (pirataria); PILOTAR (E no timão) é que pede o nível 70
    expect(zs).toMatch(/if \(!isUnlocked\(WARSHIP\.UNLOCK_ID, lvl\)\) useGameStore\.getState\(\)\.setMessage\(lockedMessage\('Pilotar o navio de guerra', WARSHIP\.UNLOCK_ID\)\);/);
    expect(zs).toMatch(/if \(drive\.mode === 'sailing' && !zsPause\.on\) \{ input\.cannonFire = 'aim'; return; \}/);
    // mira dos canhões com o mouse PRESO (01/11: "a seta do mouse aparecendo fica ruim pra jogar")
    expect(zs).toMatch(/if \(e\.button === 2 && drive\.mode === 'sailing'\) \{ input\.cannonAim = true; if \(!zsPause\.on\) el\.requestPointerLock\?\.\(\); return; \}/);
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
  it('canhão: o som do Pedro em cada bala; jogador no raio leva golpe PvP; convidado manda o golpe pro anfitrião', () => {
    const audio = fs.readFileSync('src/game/audio/audio-manager.ts', 'utf8');
    expect(audio).toMatch(/cannon: \{ url: '\/audio\/cannon\.mp3'/);
    expect(fs.existsSync('public/audio/cannon.mp3')).toBe(true);
    const zs = fs.readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8');
    expect(zs).toMatch(/for \(let i = 0; i < salvo\.length; i\+\+\) window\.setTimeout\(\(\) => audioManager\.playWorld\('cannon', 1\), i \* WARSHIP\.SALVO_GAP_MS\)/);
    const store = fs.readFileSync('src/game/state/game-store.ts', 'utf8');
    expect(store).toMatch(/broadcastPlayerHit\(r\.id, power, `Canhão de \$\{net\.selfName\}`\)/);
    expect(store).toMatch(/broadcastCreatureHit\(\{ targetId: c\.id, source: at, damage: power \}\)/);
  });
  it('rastro na água: navio (da popa) e prancha em pé (da rabeta)', () => {
    const zs = fs.readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8');
    expect(zs).toMatch(/<ZsWake look=\{WAKE_SHIP\}/);
    expect(zs).toMatch(/<ZsWake look=\{WAKE_BOARD\} source=\{\(\) => zsBoardWake\} \/>/);
    expect(zs).toMatch(/if \(r\.mode === 'ride' && !r\.air\) \{/);
  });
});

describe('tiro do herói sai da BOCA da arma (Pedro 01/11)', () => {
  it('a arma na mão marca a ponta; o projétil do herói nasce dela, a bala junto do braço (90 ms)', () => {
    const held = fs.readFileSync('src/components/world/held-weapon.tsx', 'utf8');
    expect(held).toMatch(/const muzzle = itemId === undefined \? MUZZLE_OFFSET\[kind\] : undefined;/);
    const proj = fs.readFileSync('src/components/world/projectiles.tsx', 'utf8');
    expect(proj).toMatch(/if \(ev\.hero && heroMuzzleFresh\(\)\) s\.from\.set\(heroMuzzle\.x, heroMuzzle\.y, heroMuzzle\.z\);/);
    expect(proj).toMatch(/if \(ev\.hero && ev\.projectile === 'bullet'\) \{/);
    const fb = fs.readFileSync('src/game/systems/feedbackSystem.ts', 'utf8');
    expect(fb).toMatch(/export const HERO_SHOT_DELAY_MS = 90;/);
    const store = fs.readFileSync('src/game/state/game-store.ts', 'utf8');
    expect(store.match(/heroGunSound\(\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(store.match(/prof\.projectile, undefined, (towardY|undefined), true\)/g)?.length).toBe(3);
  });
});
