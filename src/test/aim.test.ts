import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { pickAimTarget, setAiming, aimZoomStep, useAim, AIM_ZOOM_MAX, aimFire, setAimCamera, missPoint } from '@/components/world/aim';
import { houseCollider } from '@/components/world/house-collider';
import { useGameStore } from '@/game/state/game-store';
import { vi } from 'vitest';
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

const storeInicial = useGameStore.getState();
afterEach(() => { houseCollider.current = null; setAimCamera(null); useGameStore.setState(storeInicial, true); creatureAnchors.clear(); useNet.setState({ players: {}, selfSide: 'ally' }); setAiming(false); });

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

  it('igual CS: ímã quase nada — pontinho 2 m ao lado do corpo a 20 m NÃO acerta', () => {
    creatureAnchors.set('bicho', anchor(1.2, 20)); // corpo ~0,56 m de raio → borda a ~0,64 m do centro
    expect(pickAimTarget(camLookingZ())).toBeNull();
    creatureAnchors.set('bicho', anchor(0.4, 20)); // pontinho dentro do corpo
    expect(pickAimTarget(camLookingZ())).toEqual({ kind: 'creature', id: 'bicho' });
  });
  it('parede GRANDE (casa) entre mim e o alvo bloqueia; muro/torre da base não entram aqui', () => {
    useGameStore.setState({ player: { ...storeInicial.player, position: { x: 0, z: 0 } } });
    creatureAnchors.set('atras', anchor(0, 20));
    houseCollider.current = { cx: 0, cz: 10, halfX: 4, halfZ: 4, floorY: 0, wallSegs: [-3, 0, 3, 0] };
    expect(pickAimTarget(camLookingZ())).toBeNull();
    houseCollider.current = { cx: 0, cz: 10, halfX: 4, halfZ: 4, floorY: 0, wallSegs: [1, 0, 3, 0] }; // vão da porta na linha
    expect(pickAimTarget(camLookingZ())).toEqual({ kind: 'creature', id: 'atras' });
  });
  it('pontinho VAZIO: arma de longe atira no vazio (não cai no mais perto); espada usa o ataque de sempre', () => {
    creatureAnchors.set('lado', anchor(6, 6));
    setAimCamera(camLookingZ());
    const attack = vi.fn();
    const fireMiss = vi.fn(() => true);
    useGameStore.setState({ attack, fireMiss });
    expect(aimFire()).toBe(true);
    expect(fireMiss).toHaveBeenCalledTimes(1);
    expect(attack).not.toHaveBeenCalled();
    useGameStore.setState({ fireMiss: vi.fn(() => false) });
    expect(aimFire()).toBe(false); // corpo a corpo → chamador faz o hitNearest
  });

  it('tiro no vazio segue o PONTINHO: mirou pra cima sobe, pra baixo desce (Pedro, 22/10)', () => {
    useGameStore.setState({ player: { ...storeInicial.player, position: { x: 0, z: 0 } } });
    const cam = (lookY: number) => { const c = new THREE.PerspectiveCamera(50, 1, 0.1, 500); c.position.set(0, 1.8, -1.7); c.lookAt(0, lookY, 10); c.updateMatrixWorld(true); return c; };
    expect(missPoint(cam(6)).y).toBeGreaterThan(3);    // pra cima
    expect(missPoint(cam(1.8)).y).toBeCloseTo(1.8, 1);  // reto
    expect(missPoint(cam(-1)).y).toBeLessThan(1);      // pra baixo
    const fireMiss = vi.fn(() => true);
    useGameStore.setState({ fireMiss });
    setAimCamera(cam(6));
    aimFire();
    expect((fireMiss.mock.calls[0] as unknown as [unknown, number])[1]).toBeGreaterThan(3); // a altura chega no tiro
  });
});
