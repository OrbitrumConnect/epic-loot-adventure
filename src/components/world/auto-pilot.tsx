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
import { effectiveSpecialCooldown } from '@/game/systems/attributesSystem';
import { harvestNodeById } from './harvest-nodes';
import { creatureById } from './hostile-ai';
import {
  approachStandoff, createIntentRecorder, decidePilotAttack, firingReach, kiteRetreatPoint,
} from './pilot-combat';
import { buildAutoSnapshot, decideIntent, getObjectives, setAutoMode, tickWorld } from './objective-bridge';
import { setPilotAim } from './pilot-aim';
import { setPilotStatus } from './pilot-status';
import { MAP_HALF } from './world-kit';

const TICK = 0.25;
/** Ticks de recuo sem ganhar distância antes de desistir do kiting e lutar. */
const KITE_STALL_TICKS = 3;
/** Margem (m) para o recuo contar como "abriu distância" neste tick. */
const KITE_PROGRESS_EPS = 0.01;
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
  const lastWeaponSwitch = useRef(0);
  const wasIdle = useRef(false);
  // Banda morta do combate: ligado quando o piloto já está parado atirando, pra
  // não voltar a andar por uma oscilação de 0,4 m na borda do alcance.
  const engaged = useRef(false);
  // Kiting (estilo 'ranged'): histerese do recuo.
  const kiting = useRef(false);
  // Anti-degeneração do kiting: contra um bicho tão rápido quanto o piloto o
  // recuo não abre distância. Medimos isso aqui (o módulo puro não tem estado):
  // `kitePrevDist` guarda a distância do tick anterior; `kiteStall` conta ticks
  // de recuo que NÃO afastaram; ao passar de `KITE_STALL_TICKS` o piloto desiste
  // do recuo e luta até o fim deste combate (`kiteGaveUp`, pegajoso).
  const kitePrevDist = useRef<number | null>(null);
  const kiteStall = useRef(0);
  const kiteGaveUp = useRef(false);
  // Alvo do kiting: trocar de inimigo zera a desistência (tenta recuar do novo).
  const kiteTargetId = useRef<string | null>(null);
  // Grava o intent no store SÓ quando muda de conteúdo (evita set() a cada tick).
  const recordIntent = useRef<ReturnType<typeof createIntentRecorder> | null>(null);
  if (recordIntent.current == null) {
    recordIntent.current = createIntentRecorder(
      (i) => useGameStore.getState().recordPilotIntent(i),
    );
  }

  // Qualquer tecla de movimento do jogador derruba o piloto.
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (!MANUAL_KEYS.includes(e.code)) return;
      if (getObjectives().mode !== 'idle') return;
      setAutoMode('manual');
      wasIdle.current = false;
      recordIntent.current?.(null);
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
      // Y = altura ATUAL do corpo, não `terrainHeight` procedural. O mapa é um GLB:
      // o corpo assenta em `glbSurfaceY` (game-world.tsx), que diverge do procedural
      // em até ~2 m. Como o `Character` persegue o destino por `movement - body`
      // em 3D (diff.length), um Y errado inchava a diferença: a direção XZ
      // normalizada encolhia (o herói rastejava/vibrava) e a chegada — `length<=0.15`
      // — nunca era reconhecida. Copiar o Y do corpo zera diff.y → direção PLANAR
      // limpa e parada correta ao chegar.
      movement.current.set(x, player.position.y, z);
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
      setPilotAim(null);
      // Saiu do idle (tecla G, botão do HUD, fim da fila): larga o destino do
      // piloto para o jogador não continuar andando sozinho.
      if (wasIdle.current) { hold(); wasIdle.current = false; }
      recordIntent.current?.(null);
      setPilotStatus('off', 'Modo manual', '');
      return;
    }
    wasIdle.current = true;

    // Chuva de Flechas AUTOMÁTICA no idle: chamada silenciosa (auto=true) — só dispara quando
    // há arma de longe na mão, alvo no alcance e o cooldown (que escala com o nível) pronto.
    useGameStore.getState().arrowRain(true);
    // Poderes do herói no idle (mesmo esquema: silencioso, só com hostil perto + cooldown pronto).
    const gsPow = useGameStore.getState();
    gsPow.castHeroPower('boomerang', true);
    gsPow.castHeroPower('tornado', true);
    gsPow.castHeroPower('lightning', true);
    gsPow.boostFire(true); // só com pistola/rifle na mão e hostil no alcance

    const now = Date.now();
    const snapshot = buildAutoSnapshot();
    const intent = decideIntent(snapshot, now);
    // Realimenta a histerese/alvo pegajoso de decideIntent no próximo tick.
    recordIntent.current?.(intent);

    // Saiu do combate → zera a banda morta e a medição de kiting (recomeça do
    // zero no próximo alvo: volta a tentar recuar antes de concluir "é rápido").
    // Câmera de 3ª pessoa vira pro alvo enquanto o piloto luta (pilot-aim.ts).
    setPilotAim(intent.kind === 'attack' ? intent.creatureId : null, now);
    if (intent.kind !== 'attack') {
      engaged.current = false;
      kiting.current = false;
      kitePrevDist.current = null;
      kiteStall.current = 0;
      kiteGaveUp.current = false;
    }

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
        const distToTarget = distTo(target);

        // Mede o travamento do recuo (ver refs kite*). Trocou de alvo → zera.
        if (kiteTargetId.current !== intent.creatureId) {
          kiteTargetId.current = intent.creatureId;
          kiteStall.current = 0;
          kiteGaveUp.current = false;
          kitePrevDist.current = null;
        }
        if (kiting.current && kitePrevDist.current != null) {
          // Recuando: só conta como progresso se AFASTOU além da margem. Bicho
          // rápido faz a distância encolher/estagnar → acumula travamento.
          if (distToTarget > kitePrevDist.current + KITE_PROGRESS_EPS) kiteStall.current = 0;
          else kiteStall.current += 1;
        } else if (!kiting.current) {
          kiteStall.current = 0;
        }
        if (kiteStall.current >= KITE_STALL_TICKS) kiteGaveUp.current = true;
        kitePrevDist.current = distToTarget;

        // Arma na mão (do snapshot): define o `reach` (atirar daqui vs andar) e a
        // cadência. Se o slot da mão não for arma, cai no melee padrão.
        const weapons = snapshot.weapons ?? [];
        const heldHotbarIndex = snapshot.heldHotbarIndex ?? store.ui.selectedHotbar;
        const held = weapons.find(w => w.hotbarIndex === heldHotbarIndex) ?? null;
        const heldRange = held?.range ?? snapshot.heldRange ?? 4;
        const heldIsMelee = held ? held.type === 'melee' : true;
        const heldCooldownMs = (held?.cooldown ?? 0.45) * 1000;
        const nowS = now / 1000;
        const specialReady = heldIsMelee
          && nowS - (store.player.lastSpecialAt ?? 0) >= effectiveSpecialCooldown(store.player);

        // Decisão pura: trocar / especial / atacar / esperar / aproximar.
        const decision = decidePilotAttack({
          dist: distToTarget,
          weapons,
          heldHotbarIndex,
          heldRange,
          heldIsMelee,
          heldCooldownMs,
          now,
          lastWeaponSwitch: lastWeaponSwitch.current,
          lastAttack: lastAttack.current,
          switchDebounceMs: 1000,
          specialReady,
          engaged: engaged.current,
          style: snapshot.pilotWeaponStyle,
          kiting: kiting.current,
          kiteStalled: kiteGaveUp.current,
        });
        kiting.current = decision.action === 'retreat';

        // Banda morta: "engajado" = parado no alcance atirando/esperando.
        // Aproximar ou trocar de arma tira do estado de parada.
        engaged.current = decision.action !== 'approach' && decision.action !== 'switch';

        switch (decision.action) {
          case 'switch': {
            // Troca a arma e NÃO ataca neste tick: o ataque sai no próximo,
            // já com a arma certa na mão (o snapshot do próximo tick reflete).
            store.useHotbarSlot(decision.hotbarIndex, { manual: false });
            lastWeaponSwitch.current = now;
            hold();
            setPilotStatus('attack', `Trocando de arma contra ${name}`, '');
            break;
          }
          case 'special': {
            hold();
            store.specialAttack('spin');
            setPilotStatus('attack', `Especial em ${name}`, '');
            break;
          }
          case 'attack': {
            hold();
            lastAttack.current = now;
            store.attack(intent.creatureId);
            setPilotStatus('attack', `Atacando ${name}`, '');
            break;
          }
          case 'wait': {
            hold();
            setPilotStatus('attack', `Atacando ${name}`, '');
            break;
          }
          case 'retreat': {
            // Kiting: afasta do bicho até a faixa de tiro e NÃO ataca neste tick.
            goTo(kiteRetreatPoint(
              { x: player.position.x, z: player.position.z },
              { x: target.x, z: target.z },
              firingReach(heldRange),
            ));
            setPilotStatus('move', `Mantendo distância de ${name}`, '');
            break;
          }
          case 'approach': {
            // Para no PONTO DE TIRO (standoff), não em cima do bicho: com arma de
            // longe o piloto atira à distância e a inércia do sprint não o empurra
            // pro corpo-a-corpo. `reach` = alcance de tiro da arma na mão.
            const reach = firingReach(heldRange);
            const stop = approachStandoff(
              { x: player.position.x, z: player.position.z },
              { x: target.x, z: target.z },
              reach,
            );
            goTo(stop);
            setPilotStatus('move', `Fechando em ${name}`, '');
            break;
          }
          default:
            break;
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
