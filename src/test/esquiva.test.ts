import fs from 'node:fs';
import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  activeDodge, DODGE_COOLDOWN_MS, DODGE_DIST, DODGE_MS, dodgeSpeed, isInvulnerable, noteHeroDamage, requestDodge,
  resetDodge, shouldAutoDodge, sidestepFrom, startDodge, takeDodgeRequest,
} from '@/game/systems/dodgeSystem';
import { useGameStore } from '@/game/state/game-store';

/* Pedro, 26/10: "tem algo de desvio/rolamento? baixei um ('Falling To Roll') — no idle ele desvia quando toma bastante
   dano; e manual também". */
describe('esquiva / rolamento', () => {
  beforeEach(() => resetDodge());

  it('rola EXATAMENTE 3,5 m em 1 s (perfil arranca-desliza-para)', () => {
    let d = 0;
    const steps = 1000;
    for (let i = 0; i < steps; i++) d += dodgeSpeed((i + 0.5) / steps) * (DODGE_MS / 1000 / steps);
    expect(d).toBeCloseTo(DODGE_DIST, 3);
    expect(dodgeSpeed(0)).toBeCloseTo(0, 6);
    expect(dodgeSpeed(1)).toBeCloseTo(0, 6);
  });
  it('invulnerável só no MEIO do rolamento; recarga de 3 s; sem direção não rola', () => {
    expect(startDodge(0, 0, 0)).toBe(false);
    expect(startDodge(1, 0, 0)).toBe(true);
    expect(isInvulnerable(50)).toBe(false);   // arrancando
    expect(isInvulnerable(400)).toBe(true);   // no meio
    expect(isInvulnerable(900)).toBe(false);  // levantando
    expect(activeDodge(DODGE_MS + 1)).toBeNull();
    expect(startDodge(1, 0, DODGE_COOLDOWN_MS - 1)).toBe(false);
    expect(startDodge(0, 1, DODGE_COOLDOWN_MS + 1)).toBe(true);
  });
  it('piloto: rola quando perdeu ≥ 25% da vida em 3 s; pra o LADO de quem ataca', () => {
    noteHeroDamage(10, 1000); noteHeroDamage(10, 2000);
    expect(shouldAutoDodge(100, 2000)).toBe(false); // 20%
    noteHeroDamage(6, 2500);
    expect(shouldAutoDodge(100, 2500)).toBe(true);  // 26%
    expect(shouldAutoDodge(100, 5600)).toBe(false); // janela de 3 s passou
    const s = sidestepFrom({ x: 0, z: 0 }, { x: 0, z: 10 }, 1); // inimigo à frente (+Z)
    expect(Math.abs(s.z)).toBeLessThan(1e-9); expect(Math.abs(s.x)).toBeCloseTo(1, 9); // de lado
  });
  it('pedido (tecla/botão/piloto) é consumido 1× pelo herói', () => {
    requestDodge({ x: 1, z: 0 });
    expect(takeDodgeRequest()).toEqual({ dir: { x: 1, z: 0 } });
    expect(takeDodgeRequest()).toBeNull();
  });
  it('no meio do rolamento o golpe ERRA de verdade (PvP / mordida online passam por aqui)', () => {
    const st = useGameStore.getState();
    useGameStore.setState({ player: { ...st.player, hp: 100, maxHp: 100, dead: false } });
    startDodge(1, 0, Date.now() - 400); // no meio agora
    useGameStore.getState().takePlayerDamage(30, 'Pirata', false);
    expect(useGameStore.getState().player.hp).toBe(100);
    expect(useGameStore.getState().ui.message).toContain('Esquivou');
  });
  it('clip do herói: só o rolamento, cortando o ataque; descida do quadril na escala do modelo', async () => {
    const { scaleHipsDrop } = await import('@/components/world/glb-hero-mixamo');
    const tr = new THREE.VectorKeyframeTrack('mixamorigHips.position', [0, 0.7, 1.4], [0, 100, 0, 0, 20, 0, 0, 100, 0]);
    const c = new THREE.AnimationClip('dodge', 1.4, [tr]);
    const out = scaleHipsDrop(c, 1);
    const ys = Array.from(out.tracks[0]!.values).filter((_, i) => i % 3 === 1);
    [1, 0.2, 1].forEach((want, i) => expect(ys[i]).toBeCloseTo(want, 6)); // em pé = 1, rolando = 0,2
    expect(Array.from(c.tracks[0]!.values)[1]).toBe(100); // original intacto (cópia)
    const hero = fs.readFileSync('src/components/world/glb-hero-mixamo.tsx', 'utf8');
    expect(hero.indexOf('// ESQUIVA (oneshot')).toBeLessThan(hero.indexOf('// ATAQUE NÃO É CORTADO'));
    expect(hero).toMatch(/ddg\.time = DODGE_CLIP_FROM;/);
  });
  it('ligado: tecla Y, botão no rodapé, arco do celular (anel de dentro), piloto e invulnerável na IA', () => {
    const idx = fs.readFileSync('src/routes/index.tsx', 'utf8');
    expect(idx).toMatch(/e\.code === 'KeyY' && !inCity && !freeCam\) requestDodge\(\);/);
    expect(idx).toMatch(/\{ id: 'Y', label: 'Esquiva'/);
    expect(fs.readFileSync('src/components/world/mobile-controls.tsx', 'utf8')).toMatch(/p\.id === 'Q' \|\| p\.id === 'R' \|\| p\.id === 'Y'/);
    expect(fs.readFileSync('src/components/world/auto-pilot.tsx', 'utf8')).toMatch(/if \(shouldAutoDodge\(store\.player\.maxHp\)\)/);
    expect(fs.readFileSync('src/components/world/hostile-ai.ts', 'utf8')).toMatch(/const dodged = isInvulnerable\(\);/);
    expect(fs.readFileSync('src/components/game-world.tsx', 'utf8')).toMatch(/heroAction\.current = dodging \? 'dodge'/);
  });
});
