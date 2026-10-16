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
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/game/state/game-store';
import { Beast } from './beast';
import { Camp } from './camp';
import { flushPositions } from './hostile-ai';
import { getCamps } from './objective-bridge';
import { isRaider, Raider } from './raider';
import { Wolf } from './wolf';
import type { Palette } from './world-kit';
import { broadcastWorld, MP_ENABLED, registerCreatureHitHandler, useNet } from '@/net/multiplayer';

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

export function MultiplayerWorldSync() {
  const connected = useNet((s) => s.connected);
  const isHost = useNet((s) => s.isHost);
  const remoteWorld = useNet((s) => s.world);

  useEffect(() => {
    if (!MP_ENABLED || !connected || !isHost) return;
    const send = () => broadcastWorld(useGameStore.getState().creatures);
    send();
    const timer = window.setInterval(send, 450);
    return () => window.clearInterval(timer);
  }, [connected, isHost]);

  useEffect(() => {
    if (!MP_ENABLED || !connected || isHost || !remoteWorld) return;
    useGameStore.setState({ creatures: remoteWorld });
  }, [connected, isHost, remoteWorld]);

  useEffect(() => {
    if (!MP_ENABLED || !connected || !isHost) return;
    registerCreatureHitHandler((hit) => {
      const state = useGameStore.getState();
      const creature = state.creatures.find((c) => c.id === hit.targetId);
      if (!creature || creature.behavior === 'dead') return;
      const dx = creature.position.x - hit.source.x;
      const dz = creature.position.z - hit.source.z;
      if (dx * dx + dz * dz > 24 * 24) return;
      const damage = Math.max(1, Math.round(hit.damage) - creature.armor);
      const hp = Math.max(0, creature.hp - damage);
      useGameStore.setState((current) => ({
        creatures: current.creatures.map((c) => c.id !== creature.id ? c : hp === 0
          ? { ...c, hp: 0, behavior: 'dead', respawnAt: Date.now() + 20_000 }
          : { ...c, hp, behavior: 'chase' }),
      }));
    });
    return () => registerCreatureHitHandler(null);
  }, [connected, isHost]);

  return null;
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
