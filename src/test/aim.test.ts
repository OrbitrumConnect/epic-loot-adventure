import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { pickAimTarget, setAiming, aimZoomStep, useAim, AIM_ZOOM_MAX } from '@/components/world/aim';
import { creatureAnchors } from '@/components/world/hostile-ai';
import { useNet } from '@/net/multiplayer';

function camLookingZ(): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  c.position.set(0, 1.8, 0);
  c.lookAt(0, 1.8, 10);
  c.updateMatrixWorld(true);
  return c;
}
const anchor = (x: number, z: number, alive = true) => ({ x, y: 1, z, top: 0, alive });

afterEach(() => { creatureAnchors.clear(); useNet.setState({ players: {}, selfSide: 'ally' }); setAiming(false); });

describe('mira em 3ª pessoa', () => {
  it('acerta o que está NO CENTRO, não o mais perto de lado', () => {
    creatureAnchors.set('centro', anchor(0, 20));
    creatureAnchors.set('lado-perto', anchor(4, 5));
    expect(pickAimTarget(camLookingZ())).toEqual({ kind: 'creature', id: 'centro' });
  });
  it('sem nada no pontinho → nenhum alvo (não atira no vazio)', () => {
    creatureAnchors.set('lado', anchor(8, 10));
    creatureAnchors.set('morto', { ...anchor(0, 15), alive: false });
    expect(pickAimTarget(camLookingZ())).toBeNull();
  });
  it('jogador: mira só INIMIGO (aliado sem fogo amigo)', () => {
    const pose = { id: 'p2', name: 'Caio', level: 10, hp: 100, maxHp: 100, x: 0, z: 12, yaw: 0, action: 'idle', t: 0, y: 0.8 }; // peito (pés + 1 m) na linha da câmera
    useNet.setState({ players: { p2: { ...pose, side: 'ally' } }, selfSide: 'ally' });
    expect(pickAimTarget(camLookingZ())).toBeNull();
    useNet.setState({ players: { p2: { ...pose, side: 'enemy' } } });
    expect(pickAimTarget(camLookingZ())).toMatchObject({ kind: 'player', id: 'p2' });
  });
  it('zoom da rodinha só vale mirando, de 1× até o máximo, e volta a 1× ao soltar', () => {
    aimZoomStep(1);
    expect(useAim.getState().zoom).toBe(1);
    setAiming(true);
    for (let i = 0; i < 20; i++) aimZoomStep(1);
    expect(useAim.getState().zoom).toBe(AIM_ZOOM_MAX);
    setAiming(false);
    expect(useAim.getState().zoom).toBe(1);
  });
});
