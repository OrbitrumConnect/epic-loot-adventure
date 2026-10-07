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
import { useCallback, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/game/state/game-store';
import type { CreatureBehavior, CreatureState } from '@/game/types';
import { MAP_HALF, markPointerConsumed, terrainHeight } from './world-kit';
import { addObjective, getTargetId, setTarget } from './objective-bridge';

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
  const anim = useRef<HostileAnim>({
    moving: false, walkCycle: 0, distToPlayer: Infinity, swing: 0, chasing: false,
  });

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const dt = Math.min(delta, 0.05);

    const creature = creatureById(creatureId);
    if (!creature) { g.visible = false; return; }

    if (creature.behavior === 'dead') {
      g.visible = false;
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
      }
      return;
    }
    g.visible = true;

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
      targetX = wx + (ax / l2) * tuning.speed * dt;
      targetZ = wz + (az / l2) * tuning.speed * dt;
      moving = true;
    } else if (!tuning.peaceful && distToPlayer < aggroRange && distToHome < tuning.leashRange && chaseTimer.current < tuning.chaseTimeout) {
      chasing = true;
      chaseTimer.current += dt;
      if (distToPlayer <= tuning.attackRange) chaseTimer.current = 0;
      const angle = Math.atan2(px - wx, pz - wz);
      if (distToPlayer > tuning.attackRange * 0.6) {
        targetX = wx + Math.sin(angle) * tuning.speed * dt;
        targetZ = wz + Math.cos(angle) * tuning.speed * dt;
        moving = true;
      }
      if (distToPlayer <= tuning.attackRange) {
        attackCooldown.current -= dt;
        if (attackCooldown.current <= 0) {
          attackCooldown.current = creature.attackCooldown;
          swing.current = 0.35;
          const dmg = Math.max(1, creature.attackPower);
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

    g.position.x = THREE.MathUtils.clamp(targetX, -MAP_HALF, MAP_HALF);
    g.position.z = THREE.MathUtils.clamp(targetZ, -MAP_HALF, MAP_HALF);
    g.position.y = terrainHeight(g.position.x, g.position.z);

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

    if (moving) {
      walkCycle.current += dt * (distToPlayer < aggroRange ? tuning.walkSpeedChase : tuning.walkSpeedIdle);
    } else {
      walkCycle.current = 0;
    }

    if (swing.current > 0) swing.current = Math.max(0, swing.current - dt);

    // Rótulo + barra de vida: só aparecem quando ferido ou selecionado.
    const targeted = getTargetId() === creatureId;
    const hurt = creature.hp < creature.maxHp;
    const hpGroup = opts.hpGroup.current;
    if (hpGroup) hpGroup.visible = hurt || targeted;
    const labelGroup = opts.label.current;
    if (labelGroup && (hurt || targeted)) {
      // O grupo do inimigo gira em Y; o rótulo precisa ficar de frente para a
      // câmera em espaço de mundo, então desconta a rotação do pai.
      labelGroup.quaternion.copy(state.camera.quaternion);
      if (labelGroup.parent) {
        labelGroup.parent.getWorldQuaternion(tmpQuat);
        labelGroup.quaternion.premultiply(tmpQuat.invert());
      }
    }
    const fill = opts.hpFill.current;
    if (fill && (hurt || targeted)) {
      const ratio = Math.max(0, Math.min(1, creature.hp / Math.max(1, creature.maxHp)));
      fill.scale.x = Math.max(0.001, ratio);
      fill.position.x = -(1 - ratio) * 0.45;
    }
    const ring = opts.ring.current;
    if (ring) {
      ring.visible = targeted;
      if (targeted) ring.rotation.z = state.clock.elapsedTime * 0.8;
    }

    const a = anim.current;
    a.moving = moving;
    a.walkCycle = walkCycle.current;
    a.distToPlayer = distToPlayer;
    a.swing = swing.current;
    a.chasing = chasing;
    opts.onAnimate(a, dt);
  });
}
