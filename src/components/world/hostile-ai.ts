/**
 * IA compartilhada dos inimigos (lobos e saqueadores).
 *
 * Mantém exatamente a lógica que estava dentro do componente `Wolf`:
 * perseguir dentro do aggro, atacar no alcance, soltar a corda (leash),
 * vaguear perto de casa e renascer. Os números do lobo continuam os mesmos —
 * quem muda é só a tabela de `tuning` passada por espécie.
 *
 * Também centraliza duas otimizações:
 *  - uma única construção de mapa `id -> criatura` por mudança da store,
 *    em vez de um `.find()` por inimigo por quadro;
 *  - um único `setState` por flush para TODAS as posições de inimigo,
 *    em vez de um `setState` por inimigo a cada 0.2s.
 */
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/game/state/game-store';
import { mitigateDamage } from '@/game/systems/attributesSystem';
import type { CreatureBehavior, CreatureState } from '@/game/types';
import { MAP_HALF, markPointerConsumed, pixelsPerUnit, terrainHeight, pushOutSafeZone } from './world-kit';
import { terrainMeshTopY } from './terrain-collision';
import { houseFloorSurfaceY, pushOutHouseWalls, pushOutBasePieces, pushOutFactoryWalls } from './base-collision';
import { addObjective, getTargetId, setTarget } from './objective-bridge';
import { BASE_PIECES } from '@/game/data/base-pieces';
import { nearestBasePiece } from './base-targets';
import { cellCenter } from '@/game/systems/playerBaseSystem';

/**
 * Clique num inimigo: esquerdo seleciona, Shift+esquerdo enfileira uma caçada.
 * Marca o clique como consumido para o atalho de ataque não disparar também.
 */
export function useEnemyClick(creatureId: string, name: string) {
  return useCallback((e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    markPointerConsumed(e.nativeEvent);
    if (e.shiftKey) {
      addObjective('hunt_creature', creatureId);
      return;
    }
    setTarget(creatureId);
    useGameStore.getState().setMessage(`Alvo: ${name}.`);
  }, [creatureId, name]);
}

/* ------------------------------------------------------------------ *
 * Âncoras vivas (lidas por marcador/rota de alvo, sem passar pela store)
 * ------------------------------------------------------------------ */
export type CreatureAnchor = { x: number; y: number; z: number; top: number; alive: boolean };
/** Posição de mundo atual de cada criatura, atualizada a cada quadro. */
export const creatureAnchors = new Map<string, CreatureAnchor>();

let huntCacheArr: unknown = null;
let huntCacheId: string | null = null;
/** Criatura do objetivo `hunt_creature` ativo (o que o piloto está caçando). */
export function activeHuntTargetId(): string | null {
  const items = useGameStore.getState().objectives.items;
  if (items !== huntCacheArr) {
    huntCacheArr = items;
    huntCacheId = null;
    for (const o of items) {
      if (o.status === 'active' && o.kind === 'hunt_creature' && o.targetId) { huntCacheId = o.targetId; break; }
    }
  }
  return huntCacheId;
}

/** Alvo selecionado ou caçada ativa: o que o mundo destaca. */
export function isHighlightedCreature(id: string): boolean {
  return getTargetId() === id || activeHuntTargetId() === id;
}

/** Avisa a store (se ela já expõe `reportDamage`) para o eco visual do golpe. */
export function reportDamageToStore(
  targetId: string, amount: number, position: { x: number; z: number }, onPlayer: boolean,
) {
  const fn = (useGameStore.getState() as unknown as {
    reportDamage?: (id: string, amount: number, pos: { x: number; z: number }, onPlayer: boolean) => void;
  }).reportDamage;
  if (typeof fn === 'function') fn(targetId, amount, position, onPlayer);
}

/** Escala do grupo do rótulo para a barra ter ~BAR_PIXELS de largura em tela. */
export function labelScaleFor(camera: THREE.Camera, viewportHeight: number, dist: number, highlighted: boolean): number {
  const ppu = pixelsPerUnit(camera, viewportHeight, dist);
  return THREE.MathUtils.clamp(BAR_PIXELS / (0.94 * ppu), 0.8, 3.4) * (highlighted ? 1.15 : 1);
}

/** Barras de vida só dentro deste raio do jogador (ou ferido/alvo). */
/**
 * Alcance em metros para mostrar nome e barra de vida.
 * Curto de propósito: com o valor antigo (38 m) meio mapa ficava coberto de
 * barras. Ferido ou marcado como alvo continua aparecendo a qualquer distância.
 */
const LABEL_RANGE = 12;
/** Raio do corpo da criatura para a colisão com a base (aprox., igual ao player). */
const CREATURE_RADIUS = 0.5;
/** Separação entre criaturas (anti-empilhamento): empurra quando 2 ficam a menos
 *  disto; força do empurrão. Evita "10 bichos dentro de 1" cercando o jogador. */
const SEP_RADIUS = 1.1;
const SEP_STRENGTH = 3.2;
/** Largura-alvo da barra em pixels, para ser legível nas duas câmeras. */
const BAR_PIXELS = 84;

/* ------------------------------------------------------------------ *
 * Busca de criatura com cache por identidade do array
 * ------------------------------------------------------------------ */
let cachedArray: CreatureState[] | null = null;
let cachedMap = new Map<string, CreatureState>();

export function creatureById(id: string): CreatureState | undefined {
  const arr = useGameStore.getState().creatures;
  if (arr !== cachedArray) {
    cachedArray = arr;
    cachedMap = new Map(arr.map(cr => [cr.id, cr]));
  }
  return cachedMap.get(id);
}

/* ------------------------------------------------------------------ *
 * Flush de posições em lote
 * ------------------------------------------------------------------ */
type PendingSlot = { x: number; z: number; behavior: CreatureBehavior | null };

const pending = new Map<string, PendingSlot>();

/**
 * `behavior` sobe junto com a posição porque a decisão do piloto automático
 * (defesa própria) lê `behavior === 'chase' | 'attack'` da store. Sem isso, um
 * inimigo que persegue por aggro continuaria marcado como `patrol` e o piloto
 * seguiria a fila levando pancada.
 */
export function queuePosition(id: string, x: number, z: number, behavior: CreatureBehavior | null = null) {
  const slot = pending.get(id);
  if (slot) { slot.x = x; slot.z = z; slot.behavior = behavior; }
  else pending.set(id, { x, z, behavior });
}

export function flushPositions() {
  if (pending.size === 0) return;
  useGameStore.setState(s => ({
    creatures: s.creatures.map(cr => {
      const p = pending.get(cr.id);
      if (!p) return cr;
      // Morto/renascendo é estado da store: o laço de quadro não sobrescreve.
      const locked = cr.behavior === 'dead' || cr.behavior === 'respawning';
      const behavior: CreatureBehavior = locked || p.behavior === null ? cr.behavior : p.behavior;
      if (behavior === cr.behavior && cr.position.x === p.x && cr.position.z === p.z) return cr;
      return { ...cr, position: { x: p.x, z: p.z }, behavior };
    }),
  }));
  pending.clear();
}

/* ------------------------------------------------------------------ *
 * Tuning por espécie
 * ------------------------------------------------------------------ */

/**
 * CONTROLE GERAL de velocidade de TODAS as criaturas (animais + inimigos +
 * bosses). Um só número ajusta o mundo inteiro sem mexer espécie por espécie
 * (pedido do Pedro: "um controle geral que você ajusta, não eu"). 1 = normal,
 * 0.9 = 10% mais devagar, 1.1 = 10% mais rápido.
 */
export const CREATURE_SPEED_SCALE = 1;

export type HostileTuning = {
  speed: number;
  wanderSpeed: number;
  aggroRange: number;
  attackRange: number;
  leashRange: number;
  chaseTimeout: number;
  /** Aggro estendido depois de levar dano. 0 = comportamento original (lobo). */
  provokeRange: number;
  walkSpeedChase: number;
  walkSpeedIdle: number;
  /** Verbo do golpe na mensagem do mundo. */
  hitVerb: string;
  /**
   * Espécie pacífica: nunca persegue nem ataca. Ao notar o jogador a menos de
   * `aggroRange` (`provokeRange` depois de ferida) ela foge a `speed`.
   * Ausente = hostil (lobo e saqueadores não definem, números intactos).
   */
  peaceful?: boolean;
};

export const WOLF_TUNING: HostileTuning = {
  speed: 4.0,
  wanderSpeed: 1.0,
  aggroRange: 10,
  attackRange: 2.5,
  leashRange: 25,
  chaseTimeout: 12,
  provokeRange: 0,
  walkSpeedChase: 16,
  walkSpeedIdle: 8,
  hitVerb: 'mordeu',
};

export type HostileAnim = {
  moving: boolean;
  walkCycle: number;
  distToPlayer: number;
  /** >0 nos instantes logo após desferir um golpe. */
  swing: number;
  chasing: boolean;
};

export type HostileOptions = {
  creatureId: string;
  tuning: HostileTuning;
  group: React.RefObject<THREE.Group | null>;
  playerRef: React.RefObject<THREE.Group | null>;
  /** Grupo do rótulo/barra de vida — recebe a rotação da câmera. */
  label: React.RefObject<THREE.Group | null>;
  /** Preenchimento da barra de vida (escala em X). */
  hpFill: React.RefObject<THREE.Mesh | null>;
  /** Grupo inteiro da barra+nome, escondido quando não precisa aparecer. */
  hpGroup: React.RefObject<THREE.Group | null>;
  /** Anel de seleção no chão. */
  ring: React.RefObject<THREE.Object3D | null>;
  onAnimate: (anim: HostileAnim, dt: number) => void;
};

const tmpQuat = new THREE.Quaternion();

export function useHostileAI(opts: HostileOptions) {
  const { creatureId, tuning, group, playerRef } = opts;
  const walkCycle = useRef(0);
  const wanderAngle = useRef(Math.random() * Math.PI * 2);
  const wanderTimer = useRef(0);
  const attackCooldown = useRef(0);
  const currentRotY = useRef(0);
  const homePos = useRef<{ x: number; z: number } | null>(null);
  const chaseTimer = useRef(0);
  const fleeing = useRef(false);
  const swing = useRef(0);
  const anchor = useRef<CreatureAnchor | null>(null);
  const hlMesh = useRef<THREE.Object3D | null>(null);
  const barTint = useRef<'none' | 'hostile' | 'peaceful'>('none');
  const anim = useRef<HostileAnim>({
    moving: false, walkCycle: 0, distToPlayer: Infinity, swing: 0, chasing: false,
  });
  // Hit reaction: quando o HP cai, o bicho dá um "squash" rápido (recuo visual).
  const prevHp = useRef<number | null>(null);
  const hitTime = useRef(-Infinity);
  const baseScale = useRef<THREE.Vector3 | null>(null);
  const death = useRef({ startedAt: -Infinity, y: 0 });

  useEffect(() => () => { creatureAnchors.delete(creatureId); anchor.current = null; }, [creatureId]);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const dt = Math.min(delta, 0.05);

    if (!anchor.current) {
      anchor.current = { x: 0, y: 0, z: 0, top: 1.5, alive: false };
      creatureAnchors.set(creatureId, anchor.current);
    }
    const anc = anchor.current;
    const creature = creatureById(creatureId);
    if (!creature) { g.visible = false; anc.alive = false; return; }

    if (!baseScale.current) baseScale.current = g.scale.clone();
    if (creature.behavior === 'dead') {
      anc.alive = false;
      if (opts.hpGroup.current) opts.hpGroup.current.visible = false;
      if (opts.label.current) opts.label.current.visible = false;
      if (opts.ring.current) opts.ring.current.visible = false;
      if (death.current.startedAt === -Infinity) {
        death.current.startedAt = state.clock.elapsedTime;
        death.current.y = g.position.y;
      }
      // Tempo absoluto: termina mesmo fora da câmera ou após um quadro longo.
      const progress = Math.min(1, Math.max(0, (state.clock.elapsedTime - death.current.startedAt) / 0.4));
      g.visible = progress < 1;
      g.scale.copy(baseScale.current).multiplyScalar(1 - progress);
      g.position.y = death.current.y - 0.5 * progress;
      if (creature.respawnAt && Date.now() >= creature.respawnAt) {
        const home = homePos.current ?? creature.position;
        useGameStore.setState(s => ({
          creatures: s.creatures.map(cr =>
            cr.id === creatureId
              ? { ...cr, hp: cr.maxHp, behavior: 'patrol' as const, respawnAt: null, position: { ...home } }
              : cr,
          ),
        }));
        g.position.set(home.x, terrainHeight(home.x, home.z), home.z);
        g.scale.copy(baseScale.current);
        death.current.startedAt = -Infinity;
        hitTime.current = -Infinity;
        prevHp.current = creature.maxHp;
      }
      return;
    }
    // Também restaura se outra ação da store reviver a criatura.
    if (death.current.startedAt !== -Infinity) {
      g.position.y = death.current.y;
      g.scale.copy(baseScale.current);
      death.current.startedAt = -Infinity;
      hitTime.current = -Infinity;
    }
    g.visible = true;
    anc.alive = true;
    if (opts.label.current) opts.label.current.visible = true;

    // Guarda a escala base uma vez e marca o instante do golpe quando o HP cai.
    if (prevHp.current !== null && creature.hp < prevHp.current) hitTime.current = state.clock.elapsedTime;
    prevHp.current = creature.hp;

    if (!homePos.current) homePos.current = { ...creature.position };

    const player = playerRef.current;
    if (!player) return;

    const px = player.position.x;
    const pz = player.position.z;
    const wx = g.position.x;
    const wz = g.position.z;
    const distToPlayer = Math.sqrt((px - wx) * (px - wx) + (pz - wz) * (pz - wz));

    let moving = false;
    let targetX = wx;
    let targetZ = wz;

    const distToHome = Math.sqrt(
      (wx - homePos.current.x) * (wx - homePos.current.x) +
      (wz - homePos.current.z) * (wz - homePos.current.z),
    );

    // Levou dano -> entra em fúria e persegue de mais longe (lobo usa 0).
    const provoked = tuning.provokeRange > 0 && creature.hp < creature.maxHp;
    const aggroRange = provoked ? Math.max(tuning.aggroRange, tuning.provokeRange) : tuning.aggroRange;

    let chasing = false;
    let flee = false;
    if (tuning.peaceful) {
      // Histerese: começa a fugir dentro de `aggroRange` e só para 30% além,
      // para o bicho não tremer na borda do raio.
      const stopAt = aggroRange * 1.3;
      fleeing.current = distToPlayer < (fleeing.current ? stopAt : aggroRange);
      flee = fleeing.current;
    }
    if (flee) {
      chaseTimer.current = 0;
      // Corre para longe do jogador; perto da borda do mapa desliza em direção
      // ao centro para não ficar encurralado contra o limite.
      let ax = wx - px;
      let az = wz - pz;
      const len = Math.sqrt(ax * ax + az * az) || 1;
      ax /= len; az /= len;
      const edge = MAP_HALF - 4;
      if (Math.abs(wx) > edge) ax -= Math.sign(wx) * 1.2;
      if (Math.abs(wz) > edge) az -= Math.sign(wz) * 1.2;
      const l2 = Math.sqrt(ax * ax + az * az) || 1;
      targetX = wx + (ax / l2) * tuning.speed * CREATURE_SPEED_SCALE * dt;
      targetZ = wz + (az / l2) * tuning.speed * CREATURE_SPEED_SCALE * dt;
      moving = true;
    } else if (!tuning.peaceful && distToPlayer < aggroRange && distToHome < tuning.leashRange && chaseTimer.current < tuning.chaseTimeout) {
      chasing = true;
      chaseTimer.current += dt;
      if (distToPlayer <= tuning.attackRange) chaseTimer.current = 0;
      const angle = Math.atan2(px - wx, pz - wz);
      if (distToPlayer > tuning.attackRange * 0.6) {
        targetX = wx + Math.sin(angle) * tuning.speed * CREATURE_SPEED_SCALE * dt;
        targetZ = wz + Math.cos(angle) * tuning.speed * CREATURE_SPEED_SCALE * dt;
        moving = true;
      }
      if (distToPlayer <= tuning.attackRange) {
        attackCooldown.current -= dt;
        if (attackCooldown.current <= 0) {
          attackCooldown.current = creature.attackCooldown;
          swing.current = 0.35;
          const dmg = mitigateDamage(Math.max(1, creature.attackPower), useGameStore.getState().player);
          if (!useGameStore.getState().player.dead) reportDamageToStore("player", dmg, { x: px, z: pz }, true);
          useGameStore.setState(s => {
            if (s.player.dead) return {};
            const hp = Math.max(0, s.player.hp - dmg);
            if (hp <= 0) {
              return {
                player: { ...s.player, hp: 0, dead: true, respawnAt: Date.now() + 15_000 },
                ui: { ...s.ui, message: `${creature.name} te matou!` },
              };
            }
            return {
              player: { ...s.player, hp },
              ui: { ...s.ui, message: `${creature.name} ${tuning.hitVerb}! -${dmg} HP (${hp}/${s.player.maxHp})` },
            };
          });
        }
      } else {
        // Base do jogador: o jogador está fora de alcance, mas há uma peça
        // encostada (muro, porta, torre, telhado) — a criatura descarrega nela.
        // Quando o jogador também está ao alcance, ele continua sendo o alvo.
        const hit = nearestBasePiece(wx, wz);
        if (hit) {
          attackCooldown.current -= dt;
          if (attackCooldown.current <= 0) {
            attackCooldown.current = creature.attackCooldown;
            swing.current = 0.35;
            const dmg = Math.max(1, creature.attackPower);
            const kind = hit.kind;
            reportDamageToStore(hit.id, dmg, { x: hit.x, z: hit.z }, false);
            const st = useGameStore.getState();
            st.damageBasePiece(hit.id, dmg);
            st.setMessage(`${creature.name} ataca ${BASE_PIECES[kind].name.toLowerCase()} da base! -${dmg}`);
          }
        }
      }
    } else if (creatureId.startsWith('wave')) {
      // Inimigo de ONDA: marcha até a base e descarrega na peça mais próxima,
      // mesmo com o player longe (é o cerco da horda). Se o player chegar perto,
      // o ramo de cima (chase) já o prioriza.
      chaseTimer.current = 0;
      const base = useGameStore.getState().playerBase;
      const core = base?.pieces.find((p) => p.kind === 'core');
      if (core) {
        const ctr = cellCenter(core.cell);
        const distToBase = Math.sqrt((ctr.x - wx) ** 2 + (ctr.z - wz) ** 2);
        if (distToBase > 3) {
          const ang = Math.atan2(ctr.x - wx, ctr.z - wz);
          targetX = wx + Math.sin(ang) * tuning.speed * CREATURE_SPEED_SCALE * dt;
          targetZ = wz + Math.cos(ang) * tuning.speed * CREATURE_SPEED_SCALE * dt;
          moving = true;
        }
        // Mira: muro/torre mais próximo (nearestBasePiece exclui o núcleo). Só
        // quando NÃO há muro/torre no alcance (perímetro FURADO) e a criatura
        // está colada no centro é que o NÚCLEO vira alvo — o último a cair.
        const hit = nearestBasePiece(wx, wz);
        const target = hit ?? (distToBase <= 3.5 ? { id: core.id, x: ctr.x, z: ctr.z } : null);
        if (target) {
          attackCooldown.current -= dt;
          if (attackCooldown.current <= 0) {
            attackCooldown.current = creature.attackCooldown;
            swing.current = 0.35;
            const dmg = Math.max(1, creature.attackPower);
            reportDamageToStore(target.id, dmg, { x: target.x, z: target.z }, false);
            const st = useGameStore.getState();
            st.damageBasePiece(target.id, dmg);
          }
        }
      }
    } else {
      chaseTimer.current = 0;
      wanderTimer.current -= dt;
      if (wanderTimer.current <= 0) {
        wanderAngle.current = Math.random() * Math.PI * 2;
        wanderTimer.current = 2 + Math.random() * 3;
      }
      const homeAngle = Math.atan2(homePos.current.x - wx, homePos.current.z - wz);
      const blend = distToHome > 5 ? 0.8 : 0.2;
      const moveAngle = wanderAngle.current * (1 - blend) + homeAngle * blend;
      targetX = wx + Math.sin(moveAngle) * tuning.wanderSpeed * dt;
      targetZ = wz + Math.cos(moveAngle) * tuning.wanderSpeed * dt;
      moving = true;
    }

    // SEPARAÇÃO entre criaturas (anti-empilhamento): empurra pra longe de quem
    // está colado, usando as posições vivas dos `creatureAnchors`. Assim a horda
    // não vira "10 bichos dentro de 1" te cercando bugado — eles se espalham.
    {
      let sx = 0, sz = 0;
      for (const [oid, oa] of creatureAnchors) {
        if (oid === creatureId || !oa.alive) continue;
        const dx = targetX - oa.x, dz = targetZ - oa.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < SEP_RADIUS * SEP_RADIUS && d2 > 1e-4) {
          const d = Math.sqrt(d2);
          const push = (SEP_RADIUS - d) / SEP_RADIUS; // mais forte quanto mais perto
          sx += (dx / d) * push;
          sz += (dz / d) * push;
        }
      }
      if (sx !== 0 || sz !== 0) {
        targetX += sx * SEP_STRENGTH * dt;
        targetZ += sz * SEP_STRENGTH * dt;
      }
    }

    // Colisão da base (mesma do player): cerca + paredes da casa bloqueiam a
    // criatura; o portão/vão da porta deixa passar. Ela encosta e ATACA o muro
    // (nearestBasePiece acima), aí avança quando a peça cai. Sem reinventar.
    [targetX, targetZ] = pushOutBasePieces(targetX, targetZ, CREATURE_RADIUS);
    [targetX, targetZ] = pushOutHouseWalls(targetX, targetZ, CREATURE_RADIUS);
    [targetX, targetZ] = pushOutFactoryWalls(targetX, targetZ, CREATURE_RADIUS);
    // Zona segura do spawn: nenhum inimigo/boss entra — fica barrado na borda.
    [targetX, targetZ] = pushOutSafeZone(targetX, targetZ, CREATURE_RADIUS);
    g.position.x = THREE.MathUtils.clamp(targetX, -MAP_HALF, MAP_HALF);
    g.position.z = THREE.MathUtils.clamp(targetZ, -MAP_HALF, MAP_HALF);
    // Pisa no assoalho da casa quando dentro (não afunda); senão, no terreno — e
    // SOBE na superfície das montanhas (malha) quando está sobre elas.
    g.position.y = Math.max(
      terrainHeight(g.position.x, g.position.z),
      houseFloorSurfaceY(g.position.x, g.position.z),
      terrainMeshTopY(g.position.x, g.position.z),
    );

    const behavior: CreatureBehavior = flee
      ? 'flee'
      : chasing
        ? (distToPlayer <= tuning.attackRange ? 'attack' : 'chase')
        : 'patrol';
    queuePosition(creatureId, g.position.x, g.position.z, behavior);

    if (moving) {
      const desiredRot = Math.atan2(targetX - wx, targetZ - wz);
      let diff = desiredRot - currentRotY.current;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      currentRotY.current += diff * Math.min(8 * dt, 1);
    }
    g.rotation.y = currentRotY.current;

    // Hit reaction: squash (xz esticam, y achata) decaindo em ~0,22 s.
    const hb = baseScale.current;
    if (hb) {
      const since = state.clock.elapsedTime - hitTime.current;
      if (since >= 0 && since < 0.22) {
        const k = 1 - since / 0.22;
        g.scale.set(hb.x * (1 + 0.16 * k), hb.y * (1 - 0.14 * k), hb.z * (1 + 0.16 * k));
      } else {
        g.scale.copy(hb);
      }
    }

    if (moving) {
      walkCycle.current += dt * (distToPlayer < aggroRange ? tuning.walkSpeedChase : tuning.walkSpeedIdle);
    } else {
      walkCycle.current = 0;
    }

    if (swing.current > 0) swing.current = Math.max(0, swing.current - dt);

    // Rótulo + barra de vida: toda criatura viva perto do jogador (ou ferida,
    // ou destacada) mostra nome e barra; alvo/caçada ganha moldura dourada.
    const highlighted = isHighlightedCreature(creatureId);
    const targeted = getTargetId() === creatureId;
    const hurt = creature.hp < creature.maxHp;
    const showBar = distToPlayer < LABEL_RANGE || hurt || highlighted;
    const hpGroup = opts.hpGroup.current;
    if (hpGroup) {
      hpGroup.visible = showBar;
      anc.top = hpGroup.position.y;
    }
    anc.x = g.position.x;
    anc.y = g.position.y;
    anc.z = g.position.z;
    const labelGroup = opts.label.current;
    if (labelGroup && showBar) {
      // O grupo do inimigo gira em Y; o rótulo precisa ficar de frente para a
      // câmera em espaço de mundo, então desconta a rotação do pai.
      labelGroup.quaternion.copy(state.camera.quaternion);
      if (labelGroup.parent) {
        labelGroup.parent.getWorldQuaternion(tmpQuat);
        labelGroup.quaternion.premultiply(tmpQuat.invert());
      }
      // Tamanho constante em tela: a ortográfica (iso) e a perspectiva
      // (terceira pessoa) mostram a barra com ~BAR_PIXELS de largura.
      const dist = state.camera.position.distanceTo(g.position);
      labelGroup.scale.setScalar(labelScaleFor(state.camera, state.size.height, dist, highlighted));
      if (!hlMesh.current) hlMesh.current = labelGroup.getObjectByName('hl') ?? null;
      if (hlMesh.current) hlMesh.current.visible = highlighted;
      if (barTint.current === 'none') {
        const fillMat = opts.hpFill.current?.material as THREE.MeshBasicMaterial | undefined;
        if (fillMat) {
          fillMat.color.set(tuning.peaceful ? '#7bb661' : '#c8412f');
          barTint.current = tuning.peaceful ? 'peaceful' : 'hostile';
        }
      }
    }
    const fill = opts.hpFill.current;
    if (fill && showBar) {
      const ratio = Math.max(0, Math.min(1, creature.hp / Math.max(1, creature.maxHp)));
      fill.scale.x = Math.max(0.001, ratio);
      fill.position.x = -(1 - ratio) * 0.45;
    }
    const ring = opts.ring.current;
    if (ring) {
      ring.visible = highlighted;
      if (highlighted) ring.rotation.z = state.clock.elapsedTime * 0.8;
    }
    void targeted;

    const a = anim.current;
    a.moving = moving;
    a.walkCycle = walkCycle.current;
    a.distToPlayer = distToPlayer;
    a.swing = swing.current;
    a.chasing = chasing;
    opts.onAnimate(a, dt);
  });
}
