import fs from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { attackUpperFor, CROUCH_CLIPS, crouchClipFor, HERO_EXTRA_CLIPS, isCrouchAction, isUpperBodyTrack, jumpClipFor, lowerPlusUpper, scaleHipsTo } from '@/components/world/hero-moves';
import { playerAimBody } from '@/components/world/aim';
import { ZS_CROUCH_CAM_DROP, ZS_CROUCH_SPEED, zsCrouch } from '@/components/zona-sul/zs-context';
import { ZS_WALK } from '@/components/zona-sul/zs-move';

/* Pedro 01–02/11: "pack Mixamo pro PvP — pular atirando, agachar, deitar… aproveitar o máximo do pack, sem quebrar; o idle
   não muda" · 02/11 "sequência 1…6". Deitar: só no Pro Rifle Pack (não está nos Downloads). */
const track = (name: string, v: number[]) => new THREE.VectorKeyframeTrack(name, [0, 1], v);

describe('agachar + pular atirando — lógica', () => {
  it('ações e clips: agachado (espada × fuzil), pulo de fuzil (frente/trás), metade de cima do ataque por arma', () => {
    for (const a of ['crouch', 'crouch_walk', 'crouch_attack']) expect(isCrouchAction(a)).toBe(true);
    for (const a of ['idle', 'walk', 'jump', 'jump_shoot', 'attack', null]) expect(isCrouchAction(a)).toBe(false);
    expect(crouchClipFor(false, false)).toBe('crouchIdle'); expect(crouchClipFor(false, true)).toBe('crouchWalk');
    expect(crouchClipFor(true, false)).toBe('crouchIdleGun'); expect(crouchClipFor(true, true)).toBe('crouchWalkGun');
    expect(jumpClipFor(true, 'fwd')).toBe('jumpGunFwd'); expect(jumpClipFor(true, 'back')).toBe('jumpGunBack');
    expect(jumpClipFor(false, 'back')).toBe('jump'); // sem arma de fogo: o pulo de sempre
    expect([attackUpperFor('gun'), attackUpperFor('bow'), attackUpperFor('melee')]).toEqual(['attackGunUp', 'attackBowUp', 'slashUp']);
  });
  it('agachado de fuzil = PERNAS (e quadril) do agachar + TRONCO da mira de fuzil', () => {
    const lower = new THREE.AnimationClip('crouch', 2, [track('mixamorigHips.position', [0, 0.45, 0, 0, 0.45, 0]), track('mixamorigLeftUpLeg.scale', [1, 1, 1, 1, 1, 1]), track('mixamorigSpine.scale', [1, 1, 1, 1, 1, 1])]);
    const upper = new THREE.AnimationClip('aim', 3, [track('mixamorigSpine.scale', [2, 2, 2, 2, 2, 2]), track('mixamorigRightHand.scale', [3, 3, 3, 3, 3, 3]), track('mixamorigRightLeg.scale', [9, 9, 9, 9, 9, 9])]);
    const c = lowerPlusUpper(lower, upper, 'crouchIdleGun');
    const names = c.tracks.map((t) => t.name).sort();
    expect(names).toEqual(['mixamorigHips.position', 'mixamorigLeftUpLeg.scale', 'mixamorigRightHand.scale', 'mixamorigSpine.scale']);
    expect(c.tracks.find((t) => t.name === 'mixamorigSpine.scale')!.values[0]).toBe(2); // tronco = o da mira
    expect(c.duration).toBe(2);                                                         // ritmo = o do agachar
    expect(isUpperBodyTrack('mixamorigLeftForeArm.quaternion')).toBe(true);
  });
  it('quadril agachado na escala do modelo (a altura de pé do clip vira a do modelo; desce na mesma proporção)', () => {
    const c = new THREE.AnimationClip('crouchIdle', 1, [track('mixamorigHips.position', [0, 0.45, 0, 0, 0.44, 0])]);
    const s = scaleHipsTo(c, 2.0, 1.0);
    expect(s.tracks[0]!.values[1]).toBeCloseTo(0.9, 6);
    expect(c.tracks[0]!.values[1]).toBeCloseTo(0.45, 6); // não mexe no original
    expect(scaleHipsTo(c, null, 1.0)).toBe(c);           // modelo comum: como veio
  });
  it('PvP: agachado é ALVO MENOR e mais baixo na mira dos outros', () => {
    const em = playerAimBody('walk'), ag = playerAimBody('crouch_walk');
    expect(ag.cy).toBeLessThan(em.cy); expect(ag.r).toBeLessThan(em.r);
    expect(playerAimBody('crouch_attack')).toEqual(ag);
  });
  it('agachado: metade da velocidade de andar, sem correr; a câmera desce', () => {
    expect(ZS_CROUCH_SPEED).toBeCloseTo(ZS_WALK / 2, 6);
    expect(ZS_CROUCH_CAM_DROP).toBeGreaterThan(0.3);
    expect(zsCrouch.on).toBe(false);
  });
});

describe('agachar + pular atirando — clips e ligações', () => {
  it('5 clips novos do pack (só animação, esqueleto inteiro); o agachado DESCE o quadril', async () => {
    const { NodeIO } = await import('@gltf-transform/core');
    const io = new NodeIO();
    for (const k of ['crouchIdle', 'crouchWalk', 'aimGunIdle', 'jumpGunFwd', 'jumpGunBack'] as const) {
      const doc = await io.read('public' + HERO_EXTRA_CLIPS[k]), r = doc.getRoot();
      expect(r.listMeshes(), k).toHaveLength(0);
      expect(r.listNodes().length, k).toBeGreaterThanOrEqual(66);
      expect(r.listAnimations(), k).toHaveLength(1);
    }
    const hipsY = async (url: string) => {
      const a = (await io.read('public' + url)).getRoot().listAnimations()[0]!;
      const ch = a.listChannels().find((c) => /hips/i.test(c.getTargetNode()?.getName() ?? '') && c.getTargetPath() === 'translation')!;
      return ch.getSampler()!.getOutput()!.getArray()![1]!;
    };
    expect(await hipsY(HERO_EXTRA_CLIPS.crouchIdle)).toBeLessThan((await hipsY('/models/red/idle.glb')) * 0.6);
    expect(CROUCH_CLIPS).toEqual(['crouchIdle', 'crouchWalk']);
  }, 30_000);
  it('Zona Sul: Ctrl alterna (com o "Sair do site?" segurando o Ctrl+W), Espaço levanta, tiro no ar sem parar, ações por estado', () => {
    const zs = fs.readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8');
    expect(zs).toContain("if ((e.code === 'ControlLeft' || e.code === 'ControlRight') && !e.repeat) { input.crouchTap = true; armLeaveGuard(); }");
    expect(zs).toContain("window.addEventListener('beforeunload', leaveGuard)");
    expect(zs).toContain("if (k.has('Space') && zsCrouch.on) { zsCrouch.on = false; crouchStand.current = true; }");
    expect(zs).toContain('if ((atkT.current > 0 && grounded.current) || isGrabbed() || dead || drive.mode !== \'foot\') { mx = 0; mz = 0; }');
    expect(zs).toContain(": atkT.current > 0 ? (!grounded.current ? 'jump_shoot' : zsCrouch.on ? 'crouch_attack' : 'attack')");
    expect(zs).toContain("zsCrouch.on ? (moving ? 'crouch_walk' : 'crouch')");
    expect(zs).toContain("{ id: 'zs-crouch', label: crouched ? 'Levantar' : 'Agachar'"); // botão do celular
    // os outros jogadores veem (a ação vai na pose)
    expect(fs.readFileSync('src/components/world/remote-players.tsx', 'utf8')).toContain("'crouch', 'crouch_walk', 'crouch_attack', 'jump_shoot'");
    // o idle/andar/correr de sempre não mudam (só jogadores ganham os extras)
    const hero = fs.readFileSync('src/components/world/glb-hero-mixamo.tsx', 'utf8');
    expect(hero).toContain('if (extras && isCrouchAction(want))');
    expect(hero).toContain("const jumpName = extras && actions[jumpClipFor(gunHeld, moveDir)] ? jumpClipFor(gunHeld, moveDir) : 'jump';");
  });
});
