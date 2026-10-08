/**
 * Piloto automático (modo `idle`).
 *
 * Não reimplementa decisão: pergunta a `decideIntent` (função pura do
 * objectiveSystem) 4x por segundo e EXECUTA a intenção. O movimento usa o
 * canal que já existia no mundo: o ref `movement` que o `Character` persegue
 * quando nenhuma tecla está pressionada.
 *
 * Regras duras:
 *  - qualquer WASD/seta devolve o controle ao jogador na hora (`manual`);
 *  - nunca manda o jogador para fora de `MAP_HALF`;
 *  - para completamente com o jogo pausado ou o jogador morto.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/game/state/game-store';
import type { Position } from '@/game/types';
import { HARVEST_NODES } from '@/game/data/harvest-nodes';
import { weaponFor } from '@/game/data/weapons';
import { specialCooldown } from '@/game/systems/progressionSystem';
import { harvestNodeById } from './harvest-nodes';
import { creatureById } from './hostile-ai';
import { buildAutoSnapshot, decideIntent, getObjectives, setAutoMode, tickWorld } from './objective-bridge';
import { setPilotStatus } from './pilot-status';
import { MAP_HALF, terrainHeight } from './world-kit';

const TICK = 0.25;
const GATHER_REACH = 2.4;
/** Raio em volta da base onde o piloto para e descansa. */
const REST_REACH = 3;
const MANUAL_KEYS = [
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
];

export function AutoPilot({
  playerRef, movement, paused,
}: {
  playerRef: React.RefObject<THREE.Group | null>;
  movement: React.RefObject<THREE.Vector3>;
  paused: boolean;
}) {
  const acc = useRef(0);
  const lastAttack = useRef(0);
  const lastGather = useRef(0);
  const lastHeal = useRef(0);
  const lastRest = useRef(0);
  const wasIdle = useRef(false);

  // Qualquer tecla de movimento do jogador derruba o piloto.
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (!MANUAL_KEYS.includes(e.code)) return;
      if (getObjectives().mode !== 'idle') return;
      setAutoMode('manual');
      wasIdle.current = false;
      const p = playerRef.current;
      if (p) movement.current.copy(p.position);
      setPilotStatus('off', 'Piloto desligado', 'você assumiu o controle');
    };
    window.addEventListener('keydown', onDown);
    return () => window.removeEventListener('keydown', onDown);
  }, [playerRef, movement]);

  useFrame((_state, delta) => {
    acc.current += delta;
    if (acc.current < TICK) return;
    acc.current = 0;

    const player = playerRef.current;
    if (!player) return;

    const hold = () => movement.current.copy(player.position);
    const goTo = (to: Position) => {
      const x = THREE.MathUtils.clamp(to.x, -MAP_HALF + 0.5, MAP_HALF - 0.5);
      const z = THREE.MathUtils.clamp(to.z, -MAP_HALF + 0.5, MAP_HALF - 0.5);
      movement.current.set(x, terrainHeight(x, z), z);
    };
    const distTo = (to: Position) => {
      const dx = to.x - player.position.x;
      const dz = to.z - player.position.z;
      return Math.sqrt(dx * dx + dz * dz);
    };

    if (paused) {
      setPilotStatus('off', 'Jogo pausado', '');
      return;
    }

    const store = useGameStore.getState();

    if (store.player.dead) {
      hold();
      setPilotStatus('off', 'Aguardando renascer', '');
      return;
    }

    // O mundo avança (descoberta de acampamento, respawn, progresso da fila)
    // nos dois modos — o piloto é que só executa em `idle`.
    tickWorld();

    if (getObjectives().mode !== 'idle') {
      // Saiu do idle (tecla G, botão do HUD, fim da fila): larga o destino do
      // piloto para o jogador não continuar andando sozinho.
      if (wasIdle.current) { hold(); wasIdle.current = false; }
      setPilotStatus('off', 'Modo manual', '');
      return;
    }
    wasIdle.current = true;

    const now = Date.now();
    const intent = decideIntent(buildAutoSnapshot(), now);

    switch (intent.kind) {
      case 'idle': {
        hold();
        setPilotStatus('idle', 'Aguardando', intent.reason);
        break;
      }
      case 'move': {
        goTo(intent.to);
        setPilotStatus('move', 'Indo até o objetivo', intent.reason);
        break;
      }
      case 'retreat': {
        // Chegou na base: descansa. Sem isso o piloto fica preso para sempre —
        // não há regeneração passiva, então a vida nunca subiria de volta e a
        // fila nunca mais andaria.
        if (distTo(intent.to) <= REST_REACH) {
          hold();
          if (now - lastRest.current > 1500) {
            lastRest.current = now;
            store.rest();
          }
          setPilotStatus('retreat', 'Descansando na base', intent.reason);
        } else {
          goTo(intent.to);
          setPilotStatus('retreat', 'Recuando', intent.reason);
        }
        break;
      }
      case 'attack': {
        const creature = creatureById(intent.creatureId);
        const name = creature?.name ?? 'inimigo';
        const target = creature && creature.behavior !== 'dead' ? creature.position : intent.to;
        // Alcance vem da arma na mão: com arma de longe o piloto ATIRA de onde
        // está (não corre pra cima). Só anda se o bicho estiver além do alcance.
        const heldSlot = store.player.inventory.hotbar.slots[store.ui.selectedHotbar];
        const heldId = heldSlot != null ? store.player.inventory.slots[heldSlot]?.itemId ?? null : null;
        const reach = Math.max(1, weaponFor(heldId).range - 0.4);
        if (distTo(target) <= reach) {
          hold();
          // Especial quando melee e fora do cooldown (hit em área); senão ataque normal.
          const nowS = Date.now() / 1000;
          const canSpecial = !weaponFor(heldId).ranged
            && nowS - (store.player.lastSpecialAt ?? 0) >= specialCooldown(store.player.level);
          if (canSpecial) {
            store.specialAttack('spin');
            setPilotStatus('attack', `Especial em ${name}`, '');
          } else if (now - lastAttack.current > 450) {
            lastAttack.current = now;
            store.attack(intent.creatureId);
            setPilotStatus('attack', `Atacando ${name}`, '');
          } else {
            setPilotStatus('attack', `Atacando ${name}`, '');
          }
        } else {
          goTo(target);
          setPilotStatus('move', `Fechando em ${name}`, '');
        }
        break;
      }
      case 'gather': {
        // Nó colhível novo (tree/pebble/rock/veios/crystal): anda até o alcance
        // da definição e golpeia com `harvestAt`. Qualquer outro recurso segue
        // o caminho antigo (`collectNearest`).
        const node = harvestNodeById(intent.nodeId);
        const reach = node ? Math.max(1, (HARVEST_NODES[node.kind]?.range ?? GATHER_REACH) - 0.3) : GATHER_REACH;
        const dest = node ? node.position : intent.to;
        if (distTo(dest) <= reach) {
          hold();
          if (now - lastGather.current > 800) {
            lastGather.current = now;
            if (node) store.harvestAt(node.id);
            else store.collectNearest();
          }
          setPilotStatus('gather', node ? `Colhendo ${HARVEST_NODES[node.kind]?.name ?? 'recurso'}` : 'Coletando recurso', '');
        } else {
          goTo(dest);
          setPilotStatus('move', 'Indo até o recurso', '');
        }
        break;
      }
      case 'heal': {
        // `drinkPotion` e não `useHotbarSlot(índice)`: com a poção infinita de
        // desenvolvimento o índice vem como 0, que é a espada. A store escolhe
        // a melhor cura do inventário sozinha.
        hold();
        if (now - lastHeal.current > 1500) {
          lastHeal.current = now;
          store.drinkPotion();
        }
        setPilotStatus('heal', 'Bebendo poção', '');
        break;
      }
      default:
        break;
    }
  });

  return null;
}
