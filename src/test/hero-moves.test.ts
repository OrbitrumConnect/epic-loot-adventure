import fs from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  HERO_EXTRA_CLIPS, isUpperBodyTrack, localMoveDir, moveClipFor, upperBodyOnly,
} from '@/components/world/hero-moves';

/* Animações extras do jogador (Pedro, 22/10 — PvP): strafe/costas mirando, tranco de golpe,
   gesto de poder e combo de espada. */
describe('direção do movimento relativa ao olhar', () => {
  it('olhando +Z (yaw 0): frente, costas, esquerda (+X do Mixamo) e direita', () => {
    expect(localMoveDir(0, 2, 0)).toBe('fwd');
    expect(localMoveDir(0, -2, 0)).toBe('back');
    expect(localMoveDir(2, 0, 0)).toBe('left');
    expect(localMoveDir(-2, 0, 0)).toBe('right');
    expect(localMoveDir(1, 2, 0)).toBe('fwd'); // diagonal pra frente (~27°) = frente
  });
  it('vale com o corpo girado (olhando +X, yaw 90°)', () => {
    const yaw = Math.PI / 2;
    expect(localMoveDir(2, 0, yaw)).toBe('fwd');
    expect(localMoveDir(-2, 0, yaw)).toBe('back');
    expect(localMoveDir(0, -2, yaw)).toBe('left');
    expect(localMoveDir(0, 2, yaw)).toBe('right');
  });
  it('clip por arma: arma de fogo/espada = Shooter; arco = Longbow; frente = walk/run de sempre', () => {
    expect(moveClipFor('fwd', 'other', false)).toBeNull();
    expect(moveClipFor('left', 'other', false)).toBe('gunLeft');
    expect(moveClipFor('back', 'other', true)).toBe('gunBackRun');
    expect(moveClipFor('right', 'bow', false)).toBe('bowRight');
    expect(moveClipFor('back', 'bow', true)).toBe('bowBack');
  });
});

describe('golpe e gesto de poder: só a METADE DE CIMA (pernas seguem andando)', () => {
  it('separa os ossos certos', () => {
    for (const b of ['Spine', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'RightArm', 'LeftForeArm', 'RightHand', 'LeftHandIndex1'])
      expect(isUpperBodyTrack(`mixamorig${b}.quaternion`), b).toBe(true);
    for (const b of ['Hips', 'LeftUpLeg', 'RightLeg', 'LeftFoot', 'RightToeBase'])
      expect(isUpperBodyTrack(`mixamorig${b}.quaternion`), b).toBe(false);
  });
  it('upperBodyOnly tira quadril e pernas', () => {
    const t = (n: string) => new THREE.QuaternionKeyframeTrack(`mixamorig${n}.quaternion`, [0], [0, 0, 0, 1]);
    const c = upperBodyOnly(new THREE.AnimationClip('x', 1, [t('Hips'), t('Spine'), t('LeftLeg'), t('RightArm')]));
    expect(c.tracks.map((k) => k.name)).toEqual(['mixamorigSpine.quaternion', 'mixamorigRightArm.quaternion']);
  });
});

describe('clips extras: leves, só animação, mesmos ossos do herói, sem deslizar', () => {
  const read = (f: string) => {
    const b = fs.readFileSync(`public${f}`);
    return { size: b.length, json: JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString()) };
  };
  const heroBones = new Set<string>((read('/models/red/idle.glb').json.nodes as { name?: string }[]).map((n) => n.name ?? ''));
  for (const [k, url] of Object.entries(HERO_EXTRA_CLIPS)) {
    it(k, () => {
      const { size, json } = read(url);
      expect(size).toBeLessThan(150_000);
      expect(json.meshes ?? []).toHaveLength(0);
      expect(json.animations).toHaveLength(1);
      for (const ch of json.animations[0].channels) expect(heroBones.has(json.nodes[ch.target.node].name)).toBe(true);
    });
  }
});
