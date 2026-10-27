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
import { memo, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { deadCreature, spawnWaveRaiders, useGameStore } from '@/game/state/game-store';
import { Beast } from './beast';
import { Camp } from './camp';
import { flushPositions } from './hostile-ai';
import { getCamps } from './objective-bridge';
import { isRaider, Raider } from './raider';
import { Wolf } from './wolf';
import type { Palette } from './world-kit';
import {
  broadcastWorld, fetchResumeSnapshot, MP_ENABLED, registerBaseHitHandler, registerCreatureHitHandler,
  registerMobHitHandler, registerPlayerHitHandler, registerTroopHitHandler, registerWaveSpawnHandler, registerWorldSnapshotProvider, useNet,
} from '@/net/multiplayer';
import { cellCenter } from '@/game/systems/playerBaseSystem';
import { mitigateDamage } from '@/game/systems/attributesSystem';
import { effectiveMaxHp } from '@/game/systems/equipmentStatsSystem';
import { pvpBaseDamage, pvpPlayerDamage } from '@/game/systems/pvpSystem';
import { mergeResumedWorld } from '@/game/systems/wildlifeSystem';

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

/**
 * LISTA DE BICHOS ESTÁVEL (27/10 — auditoria do Caio, conferida no código). Antes: qualquer bicho que nascia/saía
 * mudava o `roster` → a lista era refeita com um `start` NOVO pra CADA um dos ~224 → todos re-renderizavam (medido
 * pelo Caio: ~300 ms de thread travada, ~3×/s na horda). Agora: o bicho que não mudou devolve o MESMO objeto (cache
 * por id) e os componentes têm `memo` → só o que nasceu (ou mudou de nome, ex.: virou Enfurecido) desenha de novo.
 */
export type EnemyEntry = { id: string; speciesId: string; name: string; start: { x: number; z: number } };
export function nextEnemyList(
  cache: Map<string, EnemyEntry>,
  creatures: readonly { id: string; speciesId: string; name: string; position: { x: number; z: number } }[],
): { list: EnemyEntry[]; cache: Map<string, EnemyEntry> } {
  const next = new Map<string, EnemyEntry>();
  const list: EnemyEntry[] = [];
  for (const cr of creatures) {
    let e = cache.get(cr.id);
    if (!e || e.speciesId !== cr.speciesId || e.name !== cr.name) {
      e = { id: cr.id, speciesId: cr.speciesId, name: cr.name, start: { x: cr.position.x, z: cr.position.z } };
    }
    next.set(cr.id, e);
    list.push(e);
  }
  return { list, cache: next };
}
const RaiderM = memo(Raider);
const BeastM = memo(Beast);
const WolfM = memo(Wolf);

export function Enemies({ c, playerRef }: { c: Palette; playerRef: React.RefObject<THREE.Group | null> }) {
  const roster = useGameStore(s => s.creatures.map(cr => `${cr.id}#${cr.speciesId}#${cr.name}`).join('|'));
  const cache = useRef(new Map<string, EnemyEntry>());
  const list = useMemo(() => {
    const r = nextEnemyList(cache.current, useGameStore.getState().creatures);
    cache.current = r.cache;
    return r.list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster]);

  return (
    <>
      <PositionSync />
      {list.map(cr =>
        isRaider(cr.speciesId) ? (
          <RaiderM
            key={cr.id}
            c={c}
            creatureId={cr.id}
            speciesId={cr.speciesId}
            name={cr.name}
            start={cr.start}
            playerRef={playerRef}
          />
        ) : cr.speciesId === 'wolf' ? (
          <WolfM key={cr.id} c={c} creatureId={cr.id} name={cr.name} start={cr.start} playerRef={playerRef} />
        ) : (
          // Fauna nova (cervo, javali, urso, lobo alfa...) e qualquer espécie
          // desconhecida: `Beast` tem fallback em vez de sumir.
          <BeastM
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

/**
 * Sincroniza os inimigos de uma sala sem tocar no modo solo. O criador do link
 * é a única simulação; convidados recebem o mesmo roster, vida e posição.
 */
export function MultiplayerWorldSync() {
  const connected = useNet((s) => s.connected);
  const isHost = useNet((s) => s.isHost);
  const remoteWorld = useNet((s) => s.world);

  useEffect(() => {
    if (!MP_ENABLED || !connected || !isHost) return;
    // Multiplayer B: a foto que vai pro banco (sala persiste até 3 dias) = inimigos atuais.
    registerWorldSnapshotProvider(() => useGameStore.getState().creatures);
    // RETOMAR: sala vazia/pausada → começo da última foto salva (se houver), não do zero.
    let cancelled = false;
    void fetchResumeSnapshot().then((creatures) => {
      // 26/10: foto antiga (antes de uma atualização) — sem espécie que saiu, com os inimigos novos (wildlifeSystem).
      if (!cancelled && creatures && creatures.length > 0) useGameStore.setState({ creatures: mergeResumedWorld(creatures, useGameStore.getState().creatures) });
    });
    const send = () => broadcastWorld(useGameStore.getState().creatures);
    send();
    const timer = window.setInterval(send, 450);
    return () => { cancelled = true; window.clearInterval(timer); registerWorldSnapshotProvider(null); };
  }, [connected, isHost]);

  // PvP (fatia 2): aplica no jogador LOCAL o golpe recebido de um inimigo (o canal já validou a
  // inimizade e que o alvo sou eu). Vale pra host e convidado.
  useEffect(() => {
    if (!MP_ENABLED || !connected) return;
    // PvP JUSTO: o alvo aplica fração do dano + própria armadura + teto de 20% da vida máx.
    registerPlayerHitHandler((hit) => {
      const st = useGameStore.getState();
      st.takePlayerDamage(pvpPlayerDamage(hit.damage, effectiveMaxHp(st.player), (d) => mitigateDamage(d, st.player)), hit.fromName, true);
    });
    // PvP fatia 4: inimigo bateu na MINHA base → eu (dono) aplico na peça.
    registerTroopHitHandler((hit) => {
      const st = useGameStore.getState();
      st.damageFieldTroop(hit.troopId, hit.damage);
      st.setMessage(`⚔️ ${hit.fromName} está atacando suas tropas! -${Math.round(hit.damage)}`);
    });
    registerBaseHitHandler((hit) => {
      const st = useGameStore.getState();
      const piece = st.playerBase?.pieces.find((p) => p.id === hit.pieceId);
      if (!piece) return;
      // Bicho da minha horda (simulado no host): dano cheio, igual ao solo. Jogador inimigo: PvP.
      const dmg = hit.mob ? Math.max(1, Math.round(hit.damage)) : pvpBaseDamage(hit.damage);
      const at = cellCenter(piece.cell);
      st.reportDamage(piece.id, dmg, { x: at.x, z: at.z }, false);
      st.damageBasePiece(hit.pieceId, dmg);
      if (useGameStore.getState().playerBase) {
        st.setMessage(hit.mob ? `${hit.fromName} ataca sua base! -${dmg}` : `🏹 ${hit.fromName} está atacando sua base! -${dmg}`);
      }
    });
    // Host: a horda de um CONVIDADO começou → spawna no mundo único (uma vez por onda).
    registerWaveSpawnHandler((req) => {
      const prefix = `wave${req.wave}_o${req.id}_`;
      const st = useGameStore.getState();
      if (st.creatures.some((c) => c.id.startsWith(prefix) && c.behavior !== 'dead')) return;
      const spawned = spawnWaveRaiders(req.wave, req.center, Date.now(), req.id);
      useGameStore.setState((s) => ({ creatures: [...s.creatures, ...spawned] }));
    });
    // Mundo único: bicho do host me acertou (sou convidado) → minha armadura mitiga.
    registerMobHitHandler((hit) => {
      const st = useGameStore.getState();
      st.takePlayerDamage(mitigateDamage(Math.max(1, hit.damage), st.player), hit.creatureName);
    });
    return () => { registerPlayerHitHandler(null); registerMobHitHandler(null); registerBaseHitHandler(null); registerTroopHitHandler(null); registerWaveSpawnHandler(null); };
  }, [connected]);

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
      // Limite largo cobre armas à distância, sem aceitar dano do outro lado do mapa.
      if (dx * dx + dz * dz > 24 * 24) return;
      const damage = Math.max(1, Math.round(hit.damage) - creature.armor);
      const hp = Math.max(0, creature.hp - damage);
      useGameStore.setState((current) => ({
        // Morte pelo golpe do CONVIDADO: mesma regra do resto (horda não renasce; antes renascia em 20 s).
        creatures: current.creatures.map((c) => c.id !== creature.id ? c : hp === 0
          ? deadCreature(c, Date.now(), Math.random)
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
