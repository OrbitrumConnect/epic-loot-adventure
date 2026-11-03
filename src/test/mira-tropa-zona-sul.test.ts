import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { pickAimTarget } from '@/components/world/aim';
import { creatureAnchors } from '@/components/world/hostile-ai';
import { useNet } from '@/net/multiplayer';
import { WORLD } from '@/game/data/world-profile';

/* Pedro 02/11 (online): "o amigo estava sendo atacado pelas minhas tropas, tentou matar e não conseguiu dar dano em
   nenhuma". Na Zona Sul não há a malha do Vale e a mira punha a tropa (e a peça da base) do outro na ALTURA 0 — o tiro
   mirado passava por cima e contava como erro. Agora: o chão do mapa ativo (o mesmo do desenho da tropa). */
const savedHeight = WORLD.height;
afterEach(() => { WORLD.height = savedHeight; creatureAnchors.clear(); useNet.setState({ players: {}, troops: {}, selfSide: 'ally' }); });
const cam = (y: number, ty: number) => { const c = new THREE.PerspectiveCamera(50, 1, 0.1, 500); c.position.set(0, y, 0); c.lookAt(0, ty, 20); c.updateMatrixWorld(true); return c; };

describe('mira em tropa de jogador inimigo num mapa com chão alto (Zona Sul)', () => {
  it('chão a 12 m: mirando no corpo da tropa (12 + 1 m) acerta a tropa', () => {
    WORLD.height = () => 12;
    const pose = { id: 'p2', name: 'Pedro', level: 40, hp: 900, maxHp: 900, x: 60, z: 60, yaw: 0, action: 'idle', t: 0, y: 12, side: 'enemy' as const };
    useNet.setState({ players: { p2: pose }, troops: { p2: [{ i: 'troop_1', u: 'archer', x: 0, z: 20, r: 0, a: 'idle', h: 80, m: 100 }] }, selfSide: 'ally' });
    expect(pickAimTarget(cam(13.6, 13))).toEqual({ kind: 'troop', ownerId: 'p2', troopId: 'troop_1' });
  });
});
