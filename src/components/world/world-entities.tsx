/**
 * Listas vivas do mundo: inimigos (dirigidos pelo array `creatures` da store)
 * e acampamentos.
 *
 * Reatividade sem custo por quadro: os seletores devolvem uma ASSINATURA em
 * string (ids, espécie, estado). Posição mudando 5x/s não re-renderiza nada —
 * só mudança de elenco (spawn/respawn/limpeza) remonta a lista. Tudo que é por
 * quadro continua lendo `getState()` dentro do laço.
 */
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/game/state/game-store';
import { Beast } from './beast';
import { Camp } from './camp';
import { flushPositions } from './hostile-ai';
import { getCamps } from './objective-bridge';
import { isRaider, Raider } from './raider';
import { Wolf } from './wolf';
import type { Palette } from './world-kit';

const SYNC_INTERVAL = 0.2;

function PositionSync() {
  const acc = useRef(0);
  useFrame((_s, delta) => {
    acc.current += delta;
    if (acc.current < SYNC_INTERVAL) return;
    acc.current = 0;
    flushPositions();
  });
  return null;
}

export function Enemies({ c, playerRef }: { c: Palette; playerRef: React.RefObject<THREE.Group | null> }) {
  const roster = useGameStore(s => s.creatures.map(cr => `${cr.id}#${cr.speciesId}`).join('|'));

  const list = useMemo(
    () => useGameStore.getState().creatures.map(cr => ({
      id: cr.id,
      speciesId: cr.speciesId,
      name: cr.name,
      start: { x: cr.position.x, z: cr.position.z },
    })),
    [roster],
  );

  return (
    <>
      <PositionSync />
      {list.map(cr =>
        isRaider(cr.speciesId) ? (
          <Raider
            key={cr.id}
            c={c}
            creatureId={cr.id}
            speciesId={cr.speciesId}
            name={cr.name}
            start={cr.start}
            playerRef={playerRef}
          />
        ) : cr.speciesId === 'wolf' ? (
          <Wolf key={cr.id} c={c} creatureId={cr.id} name={cr.name} start={cr.start} playerRef={playerRef} />
        ) : (
          // Fauna nova (cervo, javali, urso, lobo alfa...) e qualquer espécie
          // desconhecida: `Beast` tem fallback em vez de sumir.
          <Beast
            key={cr.id}
            c={c}
            creatureId={cr.id}
            speciesId={cr.speciesId}
            name={cr.name}
            start={cr.start}
            playerRef={playerRef}
          />
        ),
      )}
    </>
  );
}

export function Camps({ c }: { c: Palette }) {
  const signature = useGameStore(s => {
    const camps = (s as unknown as { camps?: { id: string; cleared: boolean; discovered: boolean }[] }).camps;
    if (!camps) return '';
    return camps.map(camp => `${camp.id}#${camp.cleared ? 1 : 0}${camp.discovered ? 1 : 0}`).join('|');
  });

  const list = useMemo(() => getCamps(), [signature]);

  return <>{list.map(camp => <Camp key={camp.id} camp={camp} c={c} />)}</>;
}
