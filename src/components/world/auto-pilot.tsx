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
 *  - nunca manda o jogador para fora da área andável (`isWalkable`; antes `MAP_HALF`);
 *  - para completamente com o jogo pausado ou o jogador morto.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/game/state/game-store';
import type { AutoSnapshot, Position } from '@/game/types';
import { HARVEST_NODES } from '@/game/data/harvest-nodes';
import { effectiveSpecialCooldown } from '@/game/systems/attributesSystem';
import { harvestNodeById } from './harvest-nodes';
import { creatureById } from './hostile-ai';
import {
  approachStandoff, createIntentRecorder, decidePilotAttack, firingReach, kiteRetreatPoint,
} from './pilot-combat';
import { buildAutoSnapshot, decideIntent, getObjectives, setAutoMode, tickWorld } from './objective-bridge';
import { setPilotAim } from './pilot-aim';
import { useAim } from './aim';
import { noteHeroDamage, requestDodge, shouldAutoDodge, sidestepFrom } from '@/game/systems/dodgeSystem';
import { setPilotStatus } from './pilot-status';
import { MAP_HALF } from './world-kit';
import { clampX, clampZ, isClassicWorld } from '@/game/data/world-profile';
import { isWalkable } from './map-walk';

const TICK = 0.25;
/** Ticks de recuo sem ganhar distância antes de desistir do kiting e lutar. */
const KITE_STALL_TICKS = 3;
/** Margem (m) para o recuo contar como "abriu distância" neste tick. */
const KITE_PROGRESS_EPS = 0.01;
const GATHER_REACH = 2.4;
/** Raio em volta da base onde o piloto para e descansa. */
const REST_REACH = 3;

/* --- WATCHDOG DE DESLOCAMENTO (anti-travamento em morro/árvore/pedra) -------
 * No auto, se a reta XZ até o alvo cruza um collider num morro, o `pushOut` do
 * Character cancela o passo → progresso ~0 pra sempre (decideIntent é puro,
 * re-emite o mesmo alvo). Este watchdog mede o avanço XZ por tick e, se o herói
 * não anda e não chegou, escala: desvio lateral → lado oposto → desiste do alvo
 * (blacklist) pra o decideIntent pegar outro. NÃO interfere no kiting de combate. */
/** Tamanho (ticks) da janela de progresso. ~1 s a 4 ticks/s. */
const MOVE_STALL_TICKS = 4;
/** O destino precisa ter ENCURTADO pelo menos isto (m) ao longo de uma janela de
 *  MOVE_STALL_TICKS ticks. Senão = BLOCKED. Janela (soma), não tick-a-tick: o
 *  herói preso num collider dá pulinhos de ~0,6 m e volta a travar — a soma na
 *  janela fica baixa mesmo com um pulo isolado passando de um limiar por-tick. Um
 *  herói saudável anda vários metros por segundo, muito acima disto. */
const MOVE_WINDOW_PROGRESS = 1.0;
/** Deslocamento LÍQUIDO mínimo (m) do próprio herói na janela (posição no início
 *  vs no fim, NÃO a soma por tick — a soma contaria a vibração contra o collider e
 *  mascararia o travamento). Segunda condição do BLOCKED: só trava se, além de a
 *  distância ao destino não encurtar, o herói também quase não saiu do lugar.
 *  Resolve o falso-positivo de perseguir bicho fujão (ex.: Pombo Bravo 4,68 m/s >
 *  sprint 4,32): o herói CORRE vários metros mas a distância ao alvo não cai porque
 *  o alvo foge — líquido grande → NÃO bloqueia. Preso num collider: líquido ~0. */
const MOVE_MIN_NET_DISPLACEMENT = 1.5;
/** Perto o bastante do destino: é chegada, não travamento. */
const MOVE_ARRIVAL_RADIUS = 2.5;
/** Distância lateral (m) do waypoint de desvio ao contornar o obstáculo. */
const SIDESTEP_DIST = 3.5;
/** Duração (ms) de cada desvio lateral antes de reavaliar. */
const SIDESTEP_MS = 1000;
/** Quanto (m) o destino precisa ter se aproximado entre tentativas pra contar
 *  como progresso real (senão escala pro próximo degrau da escada). */
const RECOVERY_PROGRESS = 1.5;
/** Cooldown (ms) que um alvo inalcançável fica no blacklist. */
const BLACKLIST_MS = 8000;
/** Raio (m) pra casar o destino de um `move` com a criatura/recurso a culpar. */
const BLACKLIST_MATCH_RADIUS = 4;

/**
 * Esconde do `decideIntent` os alvos no blacklist (expira os vencidos antes).
 * decideIntent é puro: sem o alvo inalcançável na lista, ele pega o próximo
 * naturalmente. Sem blacklist ativo = devolve o snapshot original (zero cópia).
 */
function pruneBlacklist(snap: AutoSnapshot, bl: Map<string, number>, now: number): AutoSnapshot {
  if (bl.size === 0) return snap;
  for (const [id, exp] of bl) if (exp <= now) bl.delete(id);
  if (bl.size === 0) return snap;
  const next: AutoSnapshot = {
    ...snap,
    creatures: snap.creatures.filter(c => !bl.has(c.id)),
    resources: snap.resources.filter(r => !bl.has(r.id)),
  };
  if (snap.harvestNodes) next.harvestNodes = snap.harvestNodes.filter(n => !bl.has(n.id));
  return next;
}

/** Id da criatura/recurso/nó mais próximo de (x,z) dentro de `radius`, ou null. */
function nearestEntityId(snap: AutoSnapshot, x: number, z: number, radius: number): string | null {
  let best: string | null = null;
  let bestD = radius * radius;
  for (const c of snap.creatures) {
    const dx = c.position.x - x, dz = c.position.z - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = c.id; }
  }
  for (const r of snap.resources) {
    const dx = r.position.x - x, dz = r.position.z - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = r.id; }
  }
  for (const n of snap.harvestNodes ?? []) {
    const dx = n.position.x - x, dz = n.position.z - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = n.id; }
  }
  return best;
}
/** Entrada PURA da decisão do watchdog, coletada no fechamento de uma janela. */
export interface WatchdogInput {
  /** Distância XZ do herói ao destino AGORA (fim da janela). */
  distToDest: number;
  /** Distância XZ ao destino no INÍCIO da janela. */
  distWindowStart: number;
  /** Deslocamento LÍQUIDO do herói na janela (início vs fim), não a soma por tick. */
  heroNetDisplacement: number;
  /** A janela fechou? (windowTicks >= MOVE_STALL_TICKS). Se false → 'none'. */
  windowFull: boolean;
  /** Degrau atual da escada: 0 nada, 1 desvio feito, 2 desvio oposto feito. */
  escalation: number;
  /** Distância ao destino quando o último desvio foi acionado (ou null). */
  distAtEscalation: number | null;
}

/** Resultado PURO: se está travado, a ação a aplicar e o próximo degrau da escada. */
export interface WatchdogResult {
  blocked: boolean;
  action: 'none' | 'sidestep' | 'opposite' | 'blacklist';
  /** Valor de `escalation` a gravar após aplicar a ação. */
  nextEscalation: number;
}

/**
 * DECISÃO do watchdog, isolada do useFrame pra ser testável sem rAF.
 * BLOCKED = (a distância ao destino encurtou < MOVE_WINDOW_PROGRESS na janela) E
 * (o deslocamento LÍQUIDO do herói < MOVE_MIN_NET_DISPLACEMENT) E (ainda longe do
 * destino). As duas primeiras juntas separam "preso no collider" (vibra no lugar,
 * líquido ~0) de "perseguindo bicho fujão" (corre vários metros, líquido grande).
 * Escala: sidestep (degrau 0) → opposite (degrau 1) → blacklist (degrau 2).
 * Aproximar-se de verdade (RECOVERY_PROGRESS) desde o último desvio reinicia a escada.
 */
export function decideWatchdog(input: WatchdogInput): WatchdogResult {
  if (!input.windowFull) return { blocked: false, action: 'none', nextEscalation: input.escalation };
  const reduced = input.distWindowStart - input.distToDest;
  const blocked =
    input.distToDest > MOVE_ARRIVAL_RADIUS
    && reduced < MOVE_WINDOW_PROGRESS
    && input.heroNetDisplacement < MOVE_MIN_NET_DISPLACEMENT;
  if (!blocked) return { blocked: false, action: 'none', nextEscalation: input.escalation };
  // Aproximou-se de verdade desde a última tentativa → escada recomeça.
  let esc = input.escalation;
  if (esc > 0 && input.distAtEscalation != null
      && input.distToDest < input.distAtEscalation - RECOVERY_PROGRESS) {
    esc = 0;
  }
  if (esc < 2) {
    return { blocked: true, action: esc === 0 ? 'sidestep' : 'opposite', nextEscalation: esc + 1 };
  }
  return { blocked: true, action: 'blacklist', nextEscalation: 0 };
}

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
  const lastHp = useRef<number | null>(null);
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
  // Watchdog de deslocamento (anti-travamento). Mede, numa JANELA de ticks, o
  // quanto a distância ao destino encurtou. Encostado num collider o herói vibra/
  // dá pulinhos sem se aproximar → janela baixa → BLOCKED. Escala desvio → desvio
  // oposto → blacklist. `distWindowStart` = distância no início da janela atual.
  const distWindowStart = useRef<number | null>(null);
  // Posição XZ do herói no INÍCIO da janela atual: o deslocamento líquido (start vs
  // fim) separa "preso no collider" de "perseguindo bicho fujão". Capturada junto
  // com `distWindowStart` e invalidada junto (null reabre a janela e recaptura).
  const heroWindowStartX = useRef(0);
  const heroWindowStartZ = useRef(0);
  const windowTicks = useRef(0);
  // Degrau da escada: 0 nada tentado, 1 desvio feito, 2 desvio oposto feito.
  const escalation = useRef(0);
  const distAtEscalation = useRef<number | null>(null);
  // Desvio ATIVO: enquanto `now < recoveryUntil`, o destino vira este waypoint.
  const recoveryUntil = useRef(0);
  const recoveryX = useRef(0);
  const recoveryZ = useRef(0);
  // Chave do alvo/destino atual; muda → zera o watchdog.
  const watchKey = useRef<string>('');
  // Alvos inalcançáveis: id → instante (ms) em que sai do blacklist.
  const blacklist = useRef<Map<string, number>>(new Map());
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
      // Destino na área andável (28/10: dá pra ir lá fora); fora dela, volta pro quadrado de antes.
      const free = isWalkable(to.x, to.z);
      const x = free ? to.x : isClassicWorld() ? THREE.MathUtils.clamp(to.x, -MAP_HALF + 0.5, MAP_HALF - 0.5) : clampX(to.x, 0.5);
      const z = free ? to.z : isClassicWorld() ? THREE.MathUtils.clamp(to.z, -MAP_HALF + 0.5, MAP_HALF - 0.5) : clampZ(to.z, 0.5);
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

    // ESQUIVA AUTOMÁTICA (dodgeSystem; Pedro 26/10: "no idle ele desvia de alguns tiros quando toma bastante dano"):
    // perdeu ≥ 25% da vida em 3 s e a esquiva está pronta → rola de LADO em relação a quem está atacando.
    const hpNow = store.player.hp;
    if (lastHp.current !== null && hpNow < lastHp.current) noteHeroDamage(lastHp.current - hpNow);
    lastHp.current = hpNow;
    if (shouldAutoDodge(store.player.maxHp)) {
      const me = { x: player.position.x, z: player.position.z };
      let foe: { x: number; z: number } | null = null; let best = Infinity;
      for (const c of store.creatures) {
        if (c.behavior !== 'attack' && c.behavior !== 'chase') continue;
        const d = (c.position.x - me.x) ** 2 + (c.position.z - me.z) ** 2;
        if (d < best) { best = d; foe = c.position; }
      }
      if (foe) requestDodge(sidestepFrom(me, foe, Math.random() < 0.5 ? 1 : -1));
    }

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
    // Esconde do decideIntent os alvos que o watchdog marcou inalcançáveis, pra
    // ele pegar o próximo. Sem blacklist ativo, `snapshot === buildAutoSnapshot()`.
    const snapshot = pruneBlacklist(buildAutoSnapshot(), blacklist.current, now);
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

    // O watchdog (depois do switch) só age em DESLOCAMENTO real; cada caso que
    // anda marca aqui o destino e, quando dá, o alvo a culpar. 'kiting' fica de
    // fora (tem a própria lógica de stall acima).
    let travelKind: 'none' | 'travel' | 'kiting' = 'none';
    let travelDestX = 0;
    let travelDestZ = 0;
    let travelTargetId: string | null = null;

    switch (intent.kind) {
      case 'idle': {
        hold();
        setPilotStatus('idle', 'Aguardando', intent.reason);
        break;
      }
      case 'move': {
        goTo(intent.to);
        travelKind = 'travel';
        travelDestX = intent.to.x;
        travelDestZ = intent.to.z;
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
          travelKind = 'travel';
          travelDestX = intent.to.x;
          travelDestZ = intent.to.z;
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

        // Você MIRANDO (botão direito): o gatilho é seu — o piloto não atira no alvo dele (que pode estar do lado/atrás,
        // Pedro 25/10: "mirando pra frente e bala indo pro lado"). Andar/recuar seguem.
        const playerAiming = useAim.getState().active && (decision.action === 'attack' || decision.action === 'special');
        if (playerAiming) {
          hold();
          setPilotStatus('attack', 'Você está mirando', '');
          break;
        }
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
            travelKind = 'kiting'; // tem o próprio anti-travamento (kiteStall)
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
            travelKind = 'travel';
            travelDestX = stop.x;
            travelDestZ = stop.z;
            travelTargetId = intent.creatureId;
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
          travelKind = 'travel';
          travelDestX = dest.x;
          travelDestZ = dest.z;
          travelTargetId = intent.nodeId;
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

    // --- WATCHDOG DE DESLOCAMENTO -------------------------------------------
    // Só em travel (move/gather/approach/retreat-pra-base). Em parado/combate/
    // kiting zera tudo. Mede a aproximação do destino entre ticks; se não encurta
    // a distância e não chegou, escala desvio → oposto → blacklist do alvo.
    const px = player.position.x;
    const pz = player.position.z;
    if (travelKind !== 'travel') {
      windowTicks.current = 0;
      recoveryUntil.current = 0;
      distWindowStart.current = null;
      if (travelKind === 'none') {
        escalation.current = 0;
        distAtEscalation.current = null;
        watchKey.current = '';
      }
    } else {
      const key = travelTargetId ?? `@${Math.round(travelDestX)},${Math.round(travelDestZ)}`;
      if (key !== watchKey.current) {
        // Trocou de alvo/destino → recomeça o watchdog do zero.
        watchKey.current = key;
        windowTicks.current = 0;
        escalation.current = 0;
        distAtEscalation.current = null;
        recoveryUntil.current = 0;
        distWindowStart.current = null;
      }
      const ddx = travelDestX - px;
      const ddz = travelDestZ - pz;
      const distToDest = Math.sqrt(ddx * ddx + ddz * ddz);
      if (now < recoveryUntil.current) {
        // Desvio em andamento: contorna pelo waypoint lateral (goTo faz o clamp).
        // A janela recomeça só quando o desvio termina (distWindowStart = null).
        goTo({ x: recoveryX.current, z: recoveryZ.current });
        setPilotStatus('move', 'Contornando obstáculo', '');
      } else {
        // Abre a janela se for o 1º tick (ou logo após um desvio): guarda a
        // distância ao destino E a posição XZ do herói no início da janela.
        if (distWindowStart.current == null) {
          distWindowStart.current = distToDest;
          heroWindowStartX.current = px;
          heroWindowStartZ.current = pz;
          windowTicks.current = 0;
        }
        windowTicks.current += 1;
        const windowFull = windowTicks.current >= MOVE_STALL_TICKS;
        if (windowFull) {
          // Deslocamento LÍQUIDO do herói na janela: início vs fim (não soma por tick).
          const hdx = px - heroWindowStartX.current;
          const hdz = pz - heroWindowStartZ.current;
          const heroNetDisplacement = Math.sqrt(hdx * hdx + hdz * hdz);
          const decision = decideWatchdog({
            distToDest,
            distWindowStart: distWindowStart.current,
            heroNetDisplacement,
            windowFull,
            escalation: escalation.current,
            distAtEscalation: distAtEscalation.current,
          });
          // Nova janela a partir daqui (recaptura distância e posição no próximo tick).
          distWindowStart.current = distToDest;
          heroWindowStartX.current = px;
          heroWindowStartZ.current = pz;
          windowTicks.current = 0;
          escalation.current = decision.nextEscalation;
          if (decision.action === 'sidestep' || decision.action === 'opposite') {
            // Desvio lateral: perpendicular (-fz, fx) à direção herói→destino,
            // lado +1 (sidestep) ou -1 (opposite), com um passo à frente pra contornar.
            const len = Math.max(1e-3, distToDest);
            const fx = ddx / len;
            const fz = ddz / len;
            const sign = decision.action === 'sidestep' ? 1 : -1;
            recoveryX.current = px + (-fz * sign) * SIDESTEP_DIST + fx;
            recoveryZ.current = pz + (fx * sign) * SIDESTEP_DIST + fz;
            recoveryUntil.current = now + SIDESTEP_MS;
            distAtEscalation.current = distToDest;
            distWindowStart.current = null; // janela reabre após o desvio
            goTo({ x: recoveryX.current, z: recoveryZ.current });
            setPilotStatus('move', 'Contornando obstáculo', '');
          } else if (decision.action === 'blacklist') {
            // Dois lados falharam → desiste do alvo: blacklist por um cooldown e
            // deixa o decideIntent do próximo tick (snapshot filtrado) achar outro.
            const blameId = travelTargetId
              ?? nearestEntityId(snapshot, travelDestX, travelDestZ, BLACKLIST_MATCH_RADIUS);
            if (blameId) blacklist.current.set(blameId, now + BLACKLIST_MS);
            distAtEscalation.current = null;
          }
        }
      }
    }
  });

  return null;
}
