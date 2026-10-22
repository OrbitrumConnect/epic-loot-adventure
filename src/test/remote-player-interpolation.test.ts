import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RemotePoseSample } from '@/net/multiplayer';
import { interpolateRemotePose, resolveRemotePose } from '@/components/world/remote-player-interpolation';

const sample = (receivedAt: number, x: number, z = 0): RemotePoseSample => ({
  receivedAt,
  pose: { id: 'p', name: 'P', level: 1, hp: 1, maxHp: 1, x, z, yaw: 0, action: 'walk', t: receivedAt },
});

describe('remote-player-interpolation', () => {
  it('interpola a posição entre dois estados', () => {
    expect(interpolateRemotePose(sample(0, 0), sample(100, 10), 25)).toMatchObject({ x: 2.5, z: 0 });
  });

  it('mantém o primeiro estado antes do histórico', () => {
    expect(interpolateRemotePose(sample(100, 4), sample(200, 8), 0).x).toBe(4);
  });

  it('mantém o último estado depois do histórico quando a lacuna é longa', () => {
    expect(resolveRemotePose([sample(0, 0), sample(100, 10)], 500, 500, 150)?.x).toBe(10);
  });

  it('extrapola somente durante uma lacuna curta', () => {
    expect(resolveRemotePose([sample(0, 0), sample(100, 10)], 180, 180, 150)?.x).toBe(18);
  });

  it('mantém interpolação ligada ao desenho do jogador remoto', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/world/remote-players.tsx'), 'utf8');

    expect(source, 'O jogador remoto voltou a andar aos trancos.').toMatch(/remote-player-interpolation/);
  });
});
