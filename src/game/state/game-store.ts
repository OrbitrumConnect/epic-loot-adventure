import { create } from 'zustand';
import type {
  PlayerState, CreatureState, ResourceNode, DeathBag, UIState, BaseState, BaseResult, BuildingId,
  CampState, ObjectiveQueueState, ObjectiveKind, AutoMode, AutoSnapshot, Position, HarvestNodeState,
  FeedbackEvent,
} from '../types';
import { ITEMS } from '../data/items';
import { weaponFor } from '../data/weapons';
import { DEFAULT_ATTRIBUTES, type PlayerAttributes } from '../types/player';
import { CREATURES, ENEMY_RESPAWN_MULT, scaleEnemyHp } from '../data/creatures';
import { CAMPS, WORLD_HALF } from '../data/camps';
import { HARVEST_NODES } from '../data/harvest-nodes';
import { DEV_INFINITE_POTIONS } from '../config/dev-flags';
import { createInventory, addItem, removeItem, getWeight, getUsedSlots, canAddItem, getDroppableItems, getItemCount } from '../systems/inventorySystem';
import { resolveAttack, getDistance, isCriticalDamage } from '../systems/combatSystem';
import { createResourceNode, harvestNode, rollCreatureLoot, createDeathBag } from '../systems/lootSystem';
import { canCraft, craft } from '../systems/craftSystem';
import {
  createInitialBase, tickBase as resolveBase, placeBuilding as placeBaseBuilding, startUpgrade,
  enqueueUnit as enqueueBaseUnit, cancelQueueItem as cancelBaseQueueItem,
  sendExpedition as sendBaseExpedition, depositFromInventory, collectTools,
} from '../systems/baseSystem';
import { createCamps, discoverCamps, tickCamps } from '../systems/campSystem';
import {
  addObjective as addQueueObjective, clearObjectives as clearQueueObjectives, createQueue,
  findHealHotbarIndex, hasPendingObjective, removeObjective as removeQueueObjective,
  reorderObjective as reorderQueueObjective, setMode as setQueueMode, setRepeat as setQueueRepeat,
  tickObjectives,
} from '../systems/objectiveSystem';
import { HUNT_AREA_RADIUS } from '../systems/objectiveSystem';
import { creatureXp, grantXp, playerBaseAttack, xpForLevel } from '../systems/progressionSystem';
import { damageMultiplier, effectiveMaxWeight, effectiveSpecialCooldown, SKILL_STEP, SKILL_CAP_PER_ATTR } from '../systems/attributesSystem';
import { createHarvestNodes, harvestNode as harvestWorldNode, tickHarvestNodes } from '../systems/harvestSystem';
import { drinkBestPotion, shouldAutoDrink } from '../systems/potionSystem';
import { createWildCreatures } from '../systems/wildlifeSystem';
import {
  damageEvent, deathEvent, harvestEvent, healEvent, levelUpEvent, lootEvent, pruneEvents, pushEvent,
  pushEvents, shotEvent, xpEvent,
} from '../systems/feedbackSystem';
import type { FeedbackDraft } from '../systems/feedbackSystem';

/** Para onde o piloto automático recua e para onde aponta um `travel` sem alvo. */
export const HOME_POSITION: Position = { x: 0, z: 0 };

type GameState = {
  player: PlayerState;
  creatures: CreatureState[];
  resources: ResourceNode[];
  deathBags: DeathBag[];
  ui: UIState;
  attackTick: number;
  /** Incrementa a cada especial (Q/R); o mundo 3D anima. `specialKind` diz qual. */
  specialTick: number;
  specialKind: 'jump' | 'spin' | null;
  base: BaseState;
  camps: CampState[];
  objectives: ObjectiveQueueState;
  /** Criatura escolhida à mão pelo jogador (clique no mundo ou na lista). */
  targetId: string | null;
  /** Nós de colheita do mundo novo (o array `resources` acima é legado). */
  harvestNodes: HarvestNodeState[];
  /** Bebe poção sozinho com vida baixa (piloto e luta manual). */
  autoPotion: boolean;
  /** Raio (m) que o piloto ocioso usa pra caçar o bicho mais próximo (5–25; 0 = desligado). */
  autoHuntRadius: number;
  /** Eventos efêmeros (dano, XP, loot) para o mundo 3D e o HUD. Somem pelo `ttl`. */
  feedback: FeedbackEvent[];
};

type GameActions = {
  attack: (targetId: string) => void;
  specialAttack: (kind: 'jump' | 'spin') => void;
  collect: (nodeId: string) => void;
  collectNearest: () => void;
  /** Faz nascer o mini-boss (um por vez) perto do jogador. Chamado pelo timer. */
  spawnBoss: () => void;
  /** Gasta 1 ponto de skill subindo um atributo (0–100%). */
  allocateSkill: (attr: keyof PlayerAttributes) => void;
  /** Devolve 1 ponto, baixando um atributo alocado. */
  deallocateSkill: (attr: keyof PlayerAttributes) => void;
  useHotbarSlot: (index: number) => void;
  craftItem: (recipeId: string) => void;
  rest: () => void;
  setMode: (mode: UIState['mode']) => void;
  setPanel: (panel: string | null) => void;
  toggleSidebar: () => void;
  toggleChat: () => void;
  setMessage: (msg: string) => void;
  setPanelMessage: (msg: string) => void;
  updatePosition: (x: number, z: number) => void;
  startRaid: () => void;
  exitToWorld: () => void;
  openLootBag: (bagId: string) => void;
  takeLootItem: (bagId: string, slotIndex: number) => void;
  getWeight: () => number;
  getUsedSlots: () => number;
  getItemCount: (itemId: string) => number;
  tickBase: () => void;
  placeBuilding: (defId: BuildingId, plotIndex: number) => void;
  upgradeBuilding: (instanceId: string) => void;
  enqueueUnit: (instanceId: string, unitId: string) => void;
  cancelQueueItem: (instanceId: string, itemId: string) => void;
  sendExpedition: (expeditionId: string, scouts: number) => void;
  depositToBase: () => void;
  addObjective: (kind: ObjectiveKind, targetId: string | null) => void;
  removeObjective: (objectiveId: string) => void;
  clearObjectives: () => void;
  reorderObjective: (objectiveId: string, direction: -1 | 1) => void;
  setAutoMode: (mode: AutoMode) => void;
  toggleRepeat: () => void;
  setTarget: (creatureId: string | null) => void;
  harvestAt: (nodeId: string) => void;
  toggleAutoPotion: () => void;
  setAutoHuntRadius: (radius: number) => void;
  addHuntArea: (x: number, z: number) => void;
  drinkPotion: () => void;
  tickWorld: () => void;
  /** O mundo 3D chama quando uma criatura acerta o jogador (ou outro dano que só ele vê). */
  reportDamage: (targetId: string, amount: number, position: Position, onPlayer: boolean) => void;
  pruneFeedback: () => void;
  buildAutoSnapshot: () => AutoSnapshot;
};

/**
 * Mantém o peso máximo da bolsa coerente com a capacidade% (que cresce com o
 * nível). Chamado depois de cada `grantXp`: se o nível subiu, a bolsa carrega
 * mais. No nível 1 (carry 0) devolve 40 — igual ao de antes.
 */
function syncCarry(player: PlayerState): PlayerState {
  const maxWeight = effectiveMaxWeight(player);
  if (player.inventory.maxWeight === maxWeight) return player;
  return { ...player, inventory: { ...player.inventory, maxWeight } };
}

function createInitialPlayer(): PlayerState {
  // Itens originais nos 8 primeiros slots (hotbar antiga INTACTA). Arco/pistola/
  // rifle entram DEPOIS (slots 10-12) e aparecem no fim da hotbar estendida.
  const inventory = createInventory([
    { itemId: 'iron_sword', quantity: 1 },
    { itemId: 'axe', quantity: 1 },
    { itemId: 'pickaxe', quantity: 1 },
    { itemId: 'health_potion', quantity: 5 },
    { itemId: 'trap', quantity: 3 },
    { itemId: 'cooked_meat', quantity: 8 },
    { itemId: 'torch', quantity: 1 },
    { itemId: 'ancestral_strike', quantity: 1 },
    { itemId: 'wood', quantity: 12 },
    { itemId: 'stone', quantity: 8 },
    { itemId: 'bow', quantity: 1 },
    { itemId: 'pistol', quantity: 1 },
    { itemId: 'rifle', quantity: 1 },
  ]);
  // Hotbar estendida: 8 slots originais INTACTOS + arco/pistola/rifle no fim.
  inventory.hotbar.slots = [0, 1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

  return {
    id: 'player_1',
    name: 'Kael',
    classId: 'warrior',
    level: 1,
    xp: 0,
    xpToNext: xpForLevel(1),
    totalXp: 0,
    hp: 100,
    maxHp: 100,
    mana: 80,
    maxMana: 100,
    stamina: 100,
    maxStamina: 100,
    gold: 250,
    position: { x: 0, z: 1 },
    inventory,
    attackCooldown: 0.8,
    lastAttackAt: 0,
    dead: false,
    respawnAt: 0,
    lastSpecialAt: 0,
    attributes: { ...DEFAULT_ATTRIBUTES },
    skillPoints: 0,
  };
}

function createInitialCreatures(): CreatureState[] {
  return [
    {
      id: 'wolf_1',
      speciesId: 'wolf',
      name: 'Lobo do Vale',
      hp: scaleEnemyHp(80),
      maxHp: scaleEnemyHp(80),
      attackPower: 8,
      armor: 2,
      attackCooldown: 1.5,
      lastAttackAt: 0,
      position: { x: -3, z: 5 },
      behavior: 'patrol',
      lootTable: [],
      respawnAt: null,
    },
    {
      id: 'wolf_2',
      speciesId: 'wolf',
      name: 'Lobo do Vale',
      hp: scaleEnemyHp(80),
      maxHp: scaleEnemyHp(80),
      attackPower: 8,
      armor: 2,
      attackCooldown: 1.5,
      lastAttackAt: 0,
      position: { x: 5, z: 1 },
      behavior: 'patrol',
      lootTable: [],
      respawnAt: null,
    },
    {
      id: 'wolf_3',
      speciesId: 'wolf',
      name: 'Lobo do Vale',
      hp: scaleEnemyHp(80),
      maxHp: scaleEnemyHp(80),
      attackPower: 8,
      armor: 2,
      attackCooldown: 1.5,
      lastAttackAt: 0,
      position: { x: -12, z: -8 },
      behavior: 'patrol',
      lootTable: [],
      respawnAt: null,
    },
  ];
}

function createInitialResources(): ResourceNode[] {
  return [
    createResourceNode('arcane_essence', { x: -3, z: -2 }, 5),
    createResourceNode('wood', { x: 2, z: 3 }, 10),
    createResourceNode('wood', { x: -8, z: -5 }, 8),
    createResourceNode('stone', { x: 6, z: -4 }, 6),
    createResourceNode('iron_ore', { x: 9, z: -9 }, 4),
  ];
}

const INITIAL_CAMP_WORLD = createCamps(Date.now());

export const useGameStore = create<GameState & GameActions>((set, get) => ({
  player: createInitialPlayer(),
  creatures: [...createInitialCreatures(), ...createWildCreatures(), ...INITIAL_CAMP_WORLD.creatures],
  resources: createInitialResources(),
  deathBags: [],
  attackTick: 0,
  specialTick: 0,
  specialKind: null,
  base: createInitialBase(Date.now()),
  camps: INITIAL_CAMP_WORLD.camps,
  objectives: createQueue(),
  targetId: null,
  harvestNodes: createHarvestNodes(),
  autoPotion: true,
  autoHuntRadius: 35,
  feedback: [],
  ui: {
    mode: 'world',
    panel: null,
    selectedHotbar: 0,
    message: 'Você entrou no Vale dos Ancestrais.',
    panelMessage: '',
    chatOpen: false,
    sidebarCollapsed: false,
  },

  getWeight: () => getWeight(get().player.inventory),
  getUsedSlots: () => getUsedSlots(get().player.inventory),
  getItemCount: (itemId: string) => getItemCount(get().player.inventory, itemId),

  attack: (targetId: string) => {
    const state = get();
    const creature = state.creatures.find(c => c.id === targetId);
    if (!creature || creature.behavior === 'dead') return;

    // Arma ativa = item na mão (hotbar). O perfil define alcance, cadência e tipo
    // (melee vs ranged). Tocha = dano de fogo. CombatController único: humano e
    // piloto chamam este mesmo `attack`.
    const selSlot = state.player.inventory.hotbar.slots[state.ui.selectedHotbar];
    const heldItemId = selSlot != null ? state.player.inventory.slots[selSlot]?.itemId ?? null : null;
    const prof = weaponFor(heldItemId);
    const usingRanged = prof.ranged;
    const usingTorch = heldItemId === 'torch';

    const now = Date.now() / 1000;
    if (now - state.player.lastAttackAt < prof.cooldown) return;

    const dist = getDistance(state.player.position, creature.position);
    if (dist > prof.range) {
      set(s => ({ ui: { ...s.ui, message: `${creature.name} está longe demais.` } }));
      return;
    }

    const equippedWeapon = state.player.inventory.equipment.primary;
    const weaponPower = equippedWeapon ? (ITEMS[equippedWeapon]?.attackPower ?? 0) : 0;
    const TORCH_FIRE_BONUS = 9;
    const base = playerBaseAttack(state.player.level);
    const totalPower = usingRanged
      ? base + (heldItemId ? ITEMS[heldItemId]?.attackPower ?? 0 : 0)
      : usingTorch
        ? base + TORCH_FIRE_BONUS
        : base + weaponPower;

    // Atributo de dano (%): multiplica o poder final. Nível 1 sem equip = ×1 (sem mudança).
    const finalPower = Math.round(totalPower * damageMultiplier(state.player));

    const result = resolveAttack(finalPower, creature.hp, creature.maxHp, creature.armor, creature.name);

    const updatedCreatures = state.creatures.map(c => {
      if (c.id !== targetId) return c;
      if (result.targetDied) {
        const respawnAt = c.speciesId === 'raider_warlord'
          ? null // o mini-boss só volta pelo timer (BossSpawner), não renasce sozinho.
          : Date.now() + Math.round((180_000 + Math.random() * 120_000) * ENEMY_RESPAWN_MULT);
        return { ...c, hp: 0, behavior: 'dead' as const, respawnAt };
      }
      return { ...c, hp: result.targetHp, behavior: 'chase' as const };
    });

    let updatedPlayer = { ...state.player, lastAttackAt: now };
    let updatedBags = state.deathBags;
    let msg = result.message;
    const stamp = Date.now();
    const drafts: FeedbackDraft[] = [
      damageEvent(creature.id, result.damage, creature.position, {
        critical: isCriticalDamage(finalPower, creature.armor, result.damage),
        fire: usingTorch,
      }),
    ];
    // Ranged: projétil visual do jogador até o alvo.
    if (usingRanged && prof.projectile) {
      drafts.push(shotEvent(state.player.position, creature.position, prof.projectile));
    }

    if (result.targetDied) {
      const def = CREATURES[creature.speciesId];
      if (def) {
        const loot = rollCreatureLoot(def);
        for (const drop of loot) {
          if (drop.itemId) drafts.push(lootEvent(drop.itemId, drop.quantity, creature.position));
        }
        if (loot.length > 0) {
          const bag = createDeathBag(creature.id, creature.name, creature.position, loot);
          updatedBags = [...state.deathBags, bag];
          msg += ` Loot no chão!`;
        }
      }
      updatedPlayer = { ...updatedPlayer, gold: updatedPlayer.gold + 15 };
      const xpGain = creatureXp(def ?? creature);
      const granted = grantXp(updatedPlayer, xpGain);
      updatedPlayer = syncCarry(granted.player);
      msg = granted.message ?? `${msg} +${xpGain} XP.`;
      drafts.push(deathEvent(creature.id, creature.name, creature.position));
      drafts.push(xpEvent(xpGain, state.player.position));
      if (granted.result.levelsGained > 0) {
        drafts.push(levelUpEvent(granted.result.newLevel, state.player.position));
      }
    }

    // De longe (ranged) o bicho não revida na hora; ele ainda vai perseguir pela IA.
    const creatureRetaliates = !result.targetDied && !usingRanged && dist <= 4.5;
    if (creatureRetaliates) {
      const dmgToPlayer = Math.max(1, creature.attackPower - 2);
      updatedPlayer = {
        ...updatedPlayer,
        hp: Math.max(0, updatedPlayer.hp - dmgToPlayer),
      };
      msg += ` Você recebeu ${dmgToPlayer} de dano.`;
      drafts.push(damageEvent(updatedPlayer.id, dmgToPlayer, state.player.position, { onPlayer: true }));

      if (updatedPlayer.hp <= 0) {
        const droppable = getDroppableItems(updatedPlayer.inventory)
          .filter(() => Math.random() < 0.1);
        if (droppable.length > 0) {
          const bag = createDeathBag(updatedPlayer.id, updatedPlayer.name, updatedPlayer.position, droppable);
          updatedBags = [...updatedBags, bag];
        }
        updatedPlayer = {
          ...updatedPlayer,
          hp: 0,
          dead: true,
          respawnAt: Date.now() + 15_000,
        };
        msg = droppable.length > 0
          ? `Alguns itens caíram no chão.`
          : `Você não perdeu itens.`;
      }
    }

    set({
      player: updatedPlayer,
      creatures: updatedCreatures,
      deathBags: updatedBags,
      attackTick: state.attackTick + 1,
      feedback: pushEvents(state.feedback, drafts, stamp),
      ui: { ...state.ui, message: msg },
    });
  },

  // Ataque especial Q/R. Só melee/tocha (ranged não tem). Dano EM ÁREA ao redor.
  // Cooldown escala por nível (30 s → 2 s). Humano e piloto chamam esta mesma ação.
  specialAttack: (kind) => {
    const state = get();
    if (state.player.dead) return;

    const selSlot = state.player.inventory.hotbar.slots[state.ui.selectedHotbar];
    const heldId = selSlot != null ? state.player.inventory.slots[selSlot]?.itemId ?? null : null;
    if (weaponFor(heldId).ranged) {
      set(s => ({ ui: { ...s.ui, message: 'Arma de longe não tem ataque especial.' } }));
      return;
    }

    const now = Date.now() / 1000;
    const cd = effectiveSpecialCooldown(state.player);
    const since = now - (state.player.lastSpecialAt ?? 0);
    if (since < cd) {
      set(s => ({ ui: { ...s.ui, message: `Especial recarregando (${Math.ceil(cd - since)}s).` } }));
      return;
    }

    const usingTorch = heldId === 'torch';
    const equipped = state.player.inventory.equipment.primary;
    const weaponPower = equipped ? (ITEMS[equipped]?.attackPower ?? 0) : 0;
    const base = playerBaseAttack(state.player.level) + (usingTorch ? 9 : weaponPower);
    const dmgMult = damageMultiplier(state.player);
    // Jump: dano alto, raio menor. Spin: 360°, raio maior, dano menor.
    const radius = kind === 'spin' ? 3.8 : 3.2;
    const power = Math.round(base * (kind === 'jump' ? 1.8 : 1.2) * dmgMult);

    const pos = state.player.position;
    const drafts: FeedbackDraft[] = [];
    let updatedPlayer: PlayerState = { ...state.player, lastSpecialAt: now };
    let updatedBags = state.deathBags;
    let hits = 0;

    const creatures = state.creatures.map(c => {
      if (c.behavior === 'dead') return c;
      if (getDistance(pos, c.position) > radius) return c;
      hits += 1;
      const result = resolveAttack(power, c.hp, c.maxHp, c.armor, c.name);
      drafts.push(damageEvent(c.id, result.damage, c.position, {
        critical: isCriticalDamage(power, c.armor, result.damage), fire: usingTorch,
      }));
      if (result.targetDied) {
        const def = CREATURES[c.speciesId];
        if (def) {
          const loot = rollCreatureLoot(def);
          for (const d of loot) if (d.itemId) drafts.push(lootEvent(d.itemId, d.quantity, c.position));
          if (loot.length > 0) updatedBags = [...updatedBags, createDeathBag(c.id, c.name, c.position, loot)];
        }
        const xpGain = creatureXp(def ?? c);
        const g = grantXp({ ...updatedPlayer, gold: updatedPlayer.gold + 15 }, xpGain);
        updatedPlayer = syncCarry(g.player);
        drafts.push(deathEvent(c.id, c.name, c.position));
        drafts.push(xpEvent(xpGain, pos));
        if (g.result.levelsGained > 0) drafts.push(levelUpEvent(g.result.newLevel, pos));
        const respawnAt = c.speciesId === 'raider_warlord'
          ? null // o mini-boss só volta pelo timer (BossSpawner), não renasce sozinho.
          : Date.now() + Math.round((180_000 + Math.random() * 120_000) * ENEMY_RESPAWN_MULT);
        return { ...c, hp: 0, behavior: 'dead' as const, respawnAt };
      }
      return { ...c, hp: result.targetHp, behavior: 'chase' as const };
    });

    set({
      player: updatedPlayer,
      creatures,
      deathBags: updatedBags,
      feedback: pushEvents(state.feedback, drafts, Date.now()),
      specialTick: state.specialTick + 1,
      specialKind: kind,
      ui: { ...state.ui, message: hits > 0 ? `Especial! ${hits} atingido(s).` : 'Especial (nada no alcance).' },
    });
  },

  collect: (nodeId: string) => {
    const state = get();
    const nodeIdx = state.resources.findIndex(r => r.id === nodeId);
    if (nodeIdx < 0) return;

    const node = state.resources[nodeIdx]!;
    if (node.depleted) {
      set(s => ({ ui: { ...s.ui, message: 'Este recurso está esgotado.' } }));
      return;
    }

    const dist = getDistance(state.player.position, node.position);
    if (dist > 4) {
      set(s => ({ ui: { ...s.ui, message: 'Muito longe para coletar.' } }));
      return;
    }

    if (!canAddItem(state.player.inventory, node.resourceId, 1)) {
      set(s => ({ ui: { ...s.ui, message: 'Mochila cheia. Retorne à base.' } }));
      return;
    }

    const { node: updatedNode, harvested } = harvestNode(node, 2);
    const updatedInv = addItem(state.player.inventory, node.resourceId, harvested);
    const itemName = ITEMS[node.resourceId]?.name ?? node.resourceId;

    const resources = [...state.resources];
    resources[nodeIdx] = updatedNode;

    set({
      player: { ...state.player, inventory: updatedInv },
      resources,
      ui: { ...state.ui, message: `+${harvested} ${itemName} coletado.` },
    });
  },

  collectNearest: () => {
    const state = get();
    if (state.player.dead) return;
    const pos = state.player.position;

    // Nó de farm mais próximo DENTRO do alcance (árvore/rocha/veio/cristal/pedregulho).
    let bestNode: (typeof state.harvestNodes)[number] | null = null;
    let bestNodeDist = Infinity;
    for (const node of state.harvestNodes) {
      if (node.depleted) continue;
      const def = HARVEST_NODES[node.kind];
      if (!def) continue;
      const d = getDistance(pos, node.position);
      if (d <= def.range + 0.5 && d < bestNodeDist) { bestNodeDist = d; bestNode = node; }
    }

    // Recurso solto mais próximo (cristal/baú/torre), até 4 m.
    let bestRes: ResourceNode | null = null;
    let bestResDist = Infinity;
    for (const node of state.resources) {
      if (node.depleted) continue;
      const d = getDistance(pos, node.position);
      if (d <= 4 && d < bestResDist) { bestResDist = d; bestRes = node; }
    }

    // Pega o mais perto dos dois; E vira "interagir/pegar" genérico.
    if (bestNode && bestNodeDist <= bestResDist) {
      get().harvestAt(bestNode.id);
    } else if (bestRes) {
      get().collect(bestRes.id);
    } else {
      set(s => ({ ui: { ...s.ui, message: 'Nada por perto pra pegar.' } }));
    }
  },

  useHotbarSlot: (index: number) => {
    const state = get();
    const invSlotIdx = state.player.inventory.hotbar.slots[index];
    if (invSlotIdx == null) return;

    const slot = state.player.inventory.slots[invSlotIdx];
    if (!slot?.itemId) return;

    const item = ITEMS[slot.itemId];
    if (!item) return;

    set(s => ({ ui: { ...s.ui, selectedHotbar: index } }));

    if (item.usable && item.healAmount && item.healAmount > 0) {
      if (slot.quantity <= 0) {
        set(s => ({ ui: { ...s.ui, message: `Sem ${item.name}.` } }));
        return;
      }
      // DEV_INFINITE_POTIONS: em dev a cura não gasta o item.
      const newInv = DEV_INFINITE_POTIONS
        ? state.player.inventory
        : removeItem(state.player.inventory, slot.itemId!, 1);
      const newHp = Math.min(state.player.maxHp, state.player.hp + item.healAmount);
      set({
        player: { ...state.player, hp: newHp, inventory: newInv },
        feedback: newHp > state.player.hp
          ? pushEvent(state.feedback, healEvent(state.player.id, newHp - state.player.hp, state.player.position), Date.now())
          : state.feedback,
        ui: { ...state.ui, selectedHotbar: index, message: `${item.name} utilizada. +${item.healAmount} de vida.` },
      });
      return;
    }

    if (item.equippable) {
      set(s => ({
        player: {
          ...s.player,
          inventory: {
            ...s.player.inventory,
            equipment: { ...s.player.inventory.equipment, primary: item.id },
          },
        },
        ui: { ...s.ui, selectedHotbar: index, message: `${item.name} equipado.` },
      }));
      return;
    }

    set(s => ({ ui: { ...s.ui, selectedHotbar: index, message: `${item.name} selecionado.` } }));
  },

  craftItem: (recipeId: string) => {
    const state = get();
    if (!canCraft(state.player.inventory, recipeId)) {
      set(s => ({ ui: { ...s.ui, panelMessage: 'Materiais insuficientes.' } }));
      return;
    }
    const result = craft(state.player.inventory, recipeId);
    if (!result) return;

    const itemName = ITEMS[result.recipe.result.itemId]?.name ?? recipeId;
    set({
      player: { ...state.player, inventory: result.inventory },
      ui: { ...state.ui, panelMessage: `${itemName} forjado com sucesso!` },
    });
  },

  rest: () => {
    set(s => ({
      player: { ...s.player, hp: s.player.maxHp, mana: s.player.maxMana, stamina: s.player.maxStamina },
      ui: { ...s.ui, panelMessage: 'Descansou na base. Vida, mana e vigor restaurados.' },
    }));
  },

  setMode: (mode) => set(s => ({ ui: { ...s.ui, mode } })),
  setPanel: (panel) => set(s => ({ ui: { ...s.ui, panel, panelMessage: '' } })),
  toggleSidebar: () => set(s => ({ ui: { ...s.ui, sidebarCollapsed: !s.ui.sidebarCollapsed } })),
  toggleChat: () => set(s => ({ ui: { ...s.ui, chatOpen: !s.ui.chatOpen } })),
  setMessage: (msg) => set(s => ({ ui: { ...s.ui, message: msg } })),

  spawnBoss: () => {
    const state = get();
    // Um colosso por vez: se já há um vivo, não nasce outro.
    if (state.creatures.some(c => c.speciesId === 'raider_warlord' && c.behavior !== 'dead')) return;
    const def = CREATURES['raider_warlord'];
    if (!def) return;
    const p = state.player.position;
    const margin = WORLD_HALF - 6;
    // Nasce 22–34 m do jogador, direção aleatória, dentro do mundo.
    let x = Math.max(-margin, Math.min(margin, p.x + 26));
    let z = p.z;
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 22 + Math.random() * 12;
      const cx = Math.max(-margin, Math.min(margin, p.x + Math.sin(ang) * r));
      const cz = Math.max(-margin, Math.min(margin, p.z + Math.cos(ang) * r));
      if (getDistance(p, { x: cx, z: cz }) >= 18) { x = cx; z = cz; break; }
    }
    const hp = scaleEnemyHp(def.maxHp);
    const boss: CreatureState = {
      id: `boss_${Date.now()}`,
      speciesId: 'raider_warlord',
      name: def.name,
      hp,
      maxHp: hp,
      attackPower: def.attackPower,
      armor: def.armor,
      attackCooldown: def.attackCooldown,
      lastAttackAt: 0,
      position: { x, z },
      behavior: 'patrol',
      lootTable: [],
      respawnAt: null,
    };
    set(s => ({
      creatures: [...s.creatures, boss],
      ui: { ...s.ui, message: `⚠️ ${def.name} surgiu no vale! Prepare-se.` },
    }));
  },

  allocateSkill: (attr) => {
    const p = get().player;
    if ((p.skillPoints ?? 0) <= 0) return;
    const attrs: PlayerAttributes = { ...DEFAULT_ATTRIBUTES, ...(p.attributes ?? {}) };
    if (attrs[attr] >= SKILL_CAP_PER_ATTR) return; // teto por atributo
    const next: PlayerState = {
      ...p,
      skillPoints: (p.skillPoints ?? 0) - 1,
      attributes: { ...attrs, [attr]: attrs[attr] + SKILL_STEP },
    };
    set({ player: syncCarry(next) }); // capacidade% pode ter mudado -> peso máx acompanha
  },

  deallocateSkill: (attr) => {
    const p = get().player;
    const attrs: PlayerAttributes = { ...DEFAULT_ATTRIBUTES, ...(p.attributes ?? {}) };
    if (attrs[attr] <= 0) return;
    const next: PlayerState = {
      ...p,
      skillPoints: (p.skillPoints ?? 0) + 1,
      attributes: { ...attrs, [attr]: attrs[attr] - SKILL_STEP },
    };
    set({ player: syncCarry(next) });
  },
  setPanelMessage: (msg) => set(s => ({ ui: { ...s.ui, panelMessage: msg } })),
  updatePosition: (x, z) => set(s => ({ player: { ...s.player, position: { x, z } } })),
  startRaid: () => set(s => ({
    ui: { ...s.ui, mode: 'raid', panel: null, message: 'Operação local iniciada. A Fortaleza Esquecida aguarda.' },
  })),
  exitToWorld: () => set(s => ({
    ui: { ...s.ui, mode: 'world', panel: null, message: 'Uma nova expedição começou.' },
  })),

  openLootBag: (bagId: string) => {
    set(s => ({ ui: { ...s.ui, panel: 'loot-bag', panelMessage: '' } }));
  },

  takeLootItem: (bagId: string, slotIndex: number) => {
    const state = get();
    const bagIdx = state.deathBags.findIndex(b => b.id === bagId);
    if (bagIdx < 0) return;
    const bag = state.deathBags[bagIdx]!;
    const slot = bag.items[slotIndex];
    if (!slot?.itemId) return;

    if (!canAddItem(state.player.inventory, slot.itemId, slot.quantity)) {
      set(s => ({ ui: { ...s.ui, panelMessage: 'Mochila cheia.' } }));
      return;
    }

    const newInv = addItem(state.player.inventory, slot.itemId, slot.quantity);
    const itemName = ITEMS[slot.itemId]?.name ?? slot.itemId;
    const updatedItems = [...bag.items];
    updatedItems[slotIndex] = { itemId: null, quantity: 0 };
    const bags = [...state.deathBags];
    const allEmpty = updatedItems.every(i => !i.itemId);

    if (allEmpty) {
      bags.splice(bagIdx, 1);
    } else {
      bags[bagIdx] = { ...bag, items: updatedItems };
    }

    set({
      player: { ...state.player, inventory: newInv },
      deathBags: bags,
      ui: { ...state.ui, panelMessage: `+${slot.quantity} ${itemName}`, panel: allEmpty ? null : state.ui.panel },
    });
  },

  tickBase: () => {
    const state = get();
    const ticked = resolveBase(state.base, Date.now());
    const delivery = collectTools(ticked, state.player.inventory);
    if (delivery.moved.length === 0) {
      set({ base: delivery.state });
      return;
    }
    const names = delivery.moved.map(m => `${m.quantity}x ${ITEMS[m.itemId]?.name ?? m.itemId}`).join(', ');
    set({
      base: delivery.state,
      player: { ...state.player, inventory: delivery.inventory },
      ui: { ...state.ui, message: `Forja entregou: ${names}.` },
    });
  },

  placeBuilding: (defId, plotIndex) => {
    const result = placeBaseBuilding(get().base, defId, plotIndex, Date.now());
    applyBaseResult(set, result);
  },

  upgradeBuilding: (instanceId) => {
    const result = startUpgrade(get().base, instanceId, Date.now());
    applyBaseResult(set, result);
  },

  enqueueUnit: (instanceId, unitId) => {
    const result = enqueueBaseUnit(get().base, instanceId, unitId, Date.now());
    applyBaseResult(set, result);
  },

  cancelQueueItem: (instanceId, itemId) => {
    const result = cancelBaseQueueItem(get().base, instanceId, itemId, Date.now());
    applyBaseResult(set, result);
  },

  sendExpedition: (expeditionId, scouts) => {
    const result = sendBaseExpedition(get().base, expeditionId, scouts, Date.now());
    applyBaseResult(set, result);
  },

  depositToBase: () => {
    const state = get();
    const ticked = resolveBase(state.base, Date.now());
    const result = depositFromInventory(ticked, state.player.inventory);
    const total = result.moved.wood + result.moved.stone + result.moved.essence;
    const message = total > 0
      ? `Depositado: ${result.moved.wood} madeira, ${result.moved.stone} pedra, ${result.moved.essence} essência.`
      : 'Nada para depositar ou armazém cheio.';
    set({
      base: result.state,
      player: { ...state.player, inventory: result.inventory },
      ui: { ...state.ui, message },
    });
  },

  // -------------------------------------------------------------------------
  // Fila de objetivos e piloto automático
  // -------------------------------------------------------------------------

  addObjective: (kind, targetId) => {
    const state = get();
    const resolved = resolveObjectiveTarget(state, kind, targetId);
    if (!resolved) {
      set(s => ({ ui: { ...s.ui, message: 'Alvo inválido para a fila.' } }));
      return;
    }
    if (hasPendingObjective(state.objectives, kind, targetId)) {
      set(s => ({ ui: { ...s.ui, message: `${resolved.label} já está na fila.` } }));
      return;
    }
    const objectives = addQueueObjective(
      state.objectives,
      { kind, targetId, position: resolved.position, label: resolved.label },
      Date.now(),
    );
    set({ objectives, ui: { ...state.ui, message: `${resolved.label}: entrou na fila.` } });
  },

  removeObjective: (objectiveId) => {
    set(s => ({ objectives: removeQueueObjective(s.objectives, objectiveId) }));
  },

  clearObjectives: () => {
    set(s => ({
      objectives: clearQueueObjectives(s.objectives),
      ui: { ...s.ui, message: 'Fila de objetivos esvaziada.' },
    }));
  },

  reorderObjective: (objectiveId, direction) => {
    set(s => ({ objectives: reorderQueueObjective(s.objectives, objectiveId, direction) }));
  },

  setAutoMode: (mode) => {
    set(s => ({
      objectives: setQueueMode(s.objectives, mode),
      ui: {
        ...s.ui,
        message: mode === 'idle' ? 'Piloto automático ligado.' : 'Controle manual retomado.',
      },
    }));
  },

  toggleRepeat: () => {
    set(s => {
      const repeat = !s.objectives.repeat;
      return {
        objectives: setQueueRepeat(s.objectives, repeat),
        ui: { ...s.ui, message: repeat ? 'Fila em repetição.' : 'Repetição desligada.' },
      };
    });
  },

  setTarget: (creatureId) => set({ targetId: creatureId }),

  toggleAutoPotion: () => {
    set(s => ({
      autoPotion: !s.autoPotion,
      ui: { ...s.ui, message: s.autoPotion ? 'Poção automática desligada.' : 'Poção automática ligada.' },
    }));
  },

  setAutoHuntRadius: (radius) => {
    const clamped = Math.round(Math.max(5, Math.min(35, radius)));
    set(s => ({
      autoHuntRadius: clamped,
      ui: { ...s.ui, message: `Caça automática: raio ${clamped} m.` },
    }));
  },

  drinkPotion: () => {
    const state = get();
    if (state.player.dead) return;
    const result = drinkBestPotion(
      state.player.inventory, state.player.hp, state.player.maxHp, DEV_INFINITE_POTIONS,
    );
    if (!result.ok) {
      set(s => ({ ui: { ...s.ui, message: result.message } }));
      return;
    }
    set({
      player: { ...state.player, hp: result.hp, inventory: result.inventory },
      feedback: result.healed > 0
        ? pushEvent(state.feedback, healEvent(state.player.id, result.healed, state.player.position), Date.now())
        : state.feedback,
      ui: { ...state.ui, message: result.message },
    });
  },

  reportDamage: (targetId, amount, position, onPlayer) => {
    if (amount <= 0) return;
    set(s => ({
      feedback: pushEvent(s.feedback, damageEvent(targetId, Math.round(amount), position, { onPlayer }), Date.now()),
    }));
  },

  pruneFeedback: () => {
    const state = get();
    const pruned = pruneEvents(state.feedback, Date.now());
    if (pruned !== state.feedback) set({ feedback: pruned });
  },

  addHuntArea: (x, z) => {
    const state = get();
    const cx = Math.round(Math.max(-WORLD_HALF, Math.min(WORLD_HALF, x)));
    const cz = Math.round(Math.max(-WORLD_HALF, Math.min(WORLD_HALF, z)));
    const targetId = `area_${cx}_${cz}`;
    const label = `Caçar na região ${describeRegion(cx, cz)} (${cx}, ${cz})`;
    if (hasPendingObjective(state.objectives, 'hunt_area', targetId)) {
      set(s => ({ ui: { ...s.ui, message: 'Essa área de caça já está na fila.' } }));
      return;
    }
    const objectives = addQueueObjective(
      state.objectives,
      { kind: 'hunt_area', targetId, position: { x: cx, z: cz }, label, radius: HUNT_AREA_RADIUS },
      Date.now(),
    );
    set({ objectives, ui: { ...state.ui, message: `${label}: entrou na fila.` } });
  },

  harvestAt: (nodeId) => {
    const state = get();
    if (state.player.dead) return;
    const index = state.harvestNodes.findIndex(n => n.id === nodeId);
    if (index < 0) return;
    const node = state.harvestNodes[index]!;
    const def = HARVEST_NODES[node.kind];

    // +0,5 m de folga: o jogador anda entre o clique e a colheita.
    if (getDistance(state.player.position, node.position) > def.range + 0.5) {
      set(s => ({ ui: { ...s.ui, message: `${def.name}: muito longe para colher.` } }));
      return;
    }

    const result = harvestWorldNode(
      node, state.player.inventory.equipment.primary, state.player.inventory, Date.now(),
    );
    if (!result.ok) {
      set(s => ({ ui: { ...s.ui, message: result.message } }));
      return;
    }

    const harvestNodes = [...state.harvestNodes];
    harvestNodes[index] = result.node;
    const granted = grantXp({ ...state.player, inventory: result.inventory }, result.xp);
    const stamp = Date.now();
    const drafts: FeedbackDraft[] = [];
    if (result.harvested > 0) {
      drafts.push(harvestEvent(def.resourceId, result.harvested, node.position));
    }
    if (result.xp > 0) drafts.push(xpEvent(result.xp, state.player.position));
    if (granted.result.levelsGained > 0) {
      drafts.push(levelUpEvent(granted.result.newLevel, state.player.position));
    }
    set({
      player: syncCarry(granted.player),
      feedback: pushEvents(state.feedback, drafts, stamp),
      harvestNodes,
      ui: { ...state.ui, message: granted.message ?? `${result.message} +${result.xp} XP.` },
    });
  },

  tickWorld: () => {
    const state = get();
    const now = Date.now();

    // Cura automática também no jogo manual: a regra é pura (`shouldAutoDrink`),
    // quem a aciona é este tick, que roda nos dois modos.
    if (shouldAutoDrink(state.player, state.autoPotion)) {
      get().drinkPotion();
    }

    const discovery = discoverCamps(state.camps, state.player.position);
    const ticked = tickCamps(discovery.camps, state.creatures, now);

    let player = state.player;
    const messages: string[] = [];

    for (const camp of discovery.newlyDiscovered) {
      messages.push(`Você avistou o ${camp.name}.`);
    }

    // Recompensa: sai apenas de `newlyCleared`, que nunca repete o mesmo acampamento.
    for (const camp of ticked.newlyCleared) {
      const def = CAMPS[camp.defId];
      if (!def) continue;
      let inventory = player.inventory;
      const taken: string[] = [];
      for (const entry of def.reward.items) {
        if (!canAddItem(inventory, entry.itemId, entry.quantity)) continue;
        inventory = addItem(inventory, entry.itemId, entry.quantity);
        taken.push(`${entry.quantity}x ${ITEMS[entry.itemId]?.name ?? entry.itemId}`);
      }
      player = { ...player, gold: player.gold + def.reward.gold, inventory };
      messages.push(
        taken.length > 0
          ? `${camp.name} limpo! +${def.reward.gold} ouro, ${taken.join(', ')}.`
          : `${camp.name} limpo! +${def.reward.gold} ouro (mochila cheia).`,
      );
    }

    for (const camp of ticked.respawned) {
      messages.push(`${camp.name} foi reocupado.`);
    }

    const objectiveResult = tickObjectives(
      state.objectives,
      {
        playerPosition: player.position,
        creatures: ticked.creatures,
        camps: ticked.camps,
        resources: [...state.resources, ...state.harvestNodes],
      },
      now,
    );
    for (const done of objectiveResult.completed) messages.push(`Objetivo concluído: ${done.label}.`);
    for (const lost of objectiveResult.failed) {
      messages.push(`Objetivo cancelado: ${lost.label} — ${lost.failedReason ?? 'alvo perdido'}.`);
    }

    const harvestNodes = tickHarvestNodes(state.harvestNodes, now);

    const feedback = pruneEvents(state.feedback, now);

    const nothingChanged = player === state.player
      && feedback === state.feedback
      && harvestNodes === state.harvestNodes
      && ticked.camps === state.camps
      && ticked.creatures === state.creatures
      && objectiveResult.queue === state.objectives
      && messages.length === 0;
    if (nothingChanged) return;

    // `set` funcional de propósito: entre o `get()` do topo e esta escrita, um
    // ataque ou um golpe de criatura pode ter empilhado eventos de feedback.
    // Escrever o array derivado do snapshot antigo apagaria esses eventos — era
    // por isso que os cards de loot e de XP piscavam e sumiam.
    set(current => ({
      player,
      camps: ticked.camps,
      creatures: ticked.creatures,
      harvestNodes,
      feedback: pruneEvents(current.feedback, now),
      objectives: objectiveResult.queue,
      ui: messages.length > 0
        ? { ...current.ui, message: messages[messages.length - 1]! }
        : current.ui,
    }));
  },

  buildAutoSnapshot: () => {
    const state = get();
    return {
      playerPosition: state.player.position,
      playerHp: state.player.hp,
      playerMaxHp: state.player.maxHp,
      playerDead: state.player.dead,
      // Com poção infinita (dev) e sem cura na hotbar, usa o slot 0 só como sinal:
      // quem executa o `heal` deve chamar `drinkPotion()`, que ignora o índice.
      healSlot: findHealHotbarIndex(state.player.inventory) ?? (DEV_INFINITE_POTIONS ? 0 : null),
      autoPotion: state.autoPotion,
      autoHuntRadius: state.autoHuntRadius,
      attackRange: weaponFor(
        (() => {
          const s = state.player.inventory.hotbar.slots[state.ui.selectedHotbar];
          return s != null ? state.player.inventory.slots[s]?.itemId ?? null : null;
        })(),
      ).range,
      harvestNodes: state.harvestNodes.map(n => ({
        id: n.id,
        kind: n.kind,
        position: n.position,
        depleted: n.depleted,
      })),
      creatures: state.creatures.map(c => ({
        id: c.id,
        position: c.position,
        behavior: c.behavior,
        hp: c.hp,
      })),
      camps: state.camps.map(c => ({
        id: c.id,
        position: c.position,
        radius: CAMPS[c.defId]?.radius ?? 8,
        creatureIds: c.creatureIds,
        cleared: c.cleared,
      })),
      // O piloto recebe os dois: nós de colheita novos e os recursos legados.
      resources: [
        ...state.harvestNodes.map(n => ({ id: n.id, position: n.position, depleted: n.depleted })),
        ...state.resources.map(r => ({ id: r.id, position: r.position, depleted: r.depleted })),
      ],
      objectives: state.objectives,
      homePosition: HOME_POSITION,
    };
  },
}));

/** Posição e rótulo de um objetivo, derivados do alvo clicado. */
function resolveObjectiveTarget(
  state: GameState,
  kind: ObjectiveKind,
  targetId: string | null,
): { position: Position; label: string } | null {
  if (kind === 'clear_camp') {
    const camp = state.camps.find(c => c.id === targetId);
    return camp ? { position: camp.position, label: `Limpar ${camp.name}` } : null;
  }

  if (kind === 'hunt_area') return null; // criada por `addHuntArea`

  if (kind === 'hunt_creature') {
    const creature = state.creatures.find(c => c.id === targetId);
    return creature ? { position: creature.position, label: `Caçar ${creature.name}` } : null;
  }

  if (kind === 'gather_node') {
    // Nó de colheita do mundo novo tem prioridade; `resources` é o legado.
    const harvest = state.harvestNodes.find(n => n.id === targetId);
    if (harvest) {
      const def = HARVEST_NODES[harvest.kind];
      return { position: harvest.position, label: `Coletar ${def?.name ?? harvest.kind}` };
    }
    const node = state.resources.find(r => r.id === targetId);
    if (!node) return null;
    const name = ITEMS[node.resourceId]?.name ?? node.resourceId;
    return { position: node.position, label: `Coletar ${name}` };
  }

  // travel: aceita um acampamento, um recurso ou nenhum alvo (volta para a base).
  const camp = state.camps.find(c => c.id === targetId);
  if (camp) return { position: camp.position, label: `Viajar até ${camp.name}` };
  const harvestTarget = state.harvestNodes.find(n => n.id === targetId);
  if (harvestTarget) {
    const def = HARVEST_NODES[harvestTarget.kind];
    return { position: harvestTarget.position, label: `Viajar até ${def?.name ?? harvestTarget.kind}` };
  }
  const node = state.resources.find(r => r.id === targetId);
  if (node) {
    const name = ITEMS[node.resourceId]?.name ?? node.resourceId;
    return { position: node.position, label: `Viajar até ${name}` };
  }
  if (targetId != null) return null;
  return { position: HOME_POSITION, label: 'Voltar para a base' };
}

function applyBaseResult(
  set: (fn: (s: GameState) => Partial<GameState>) => void,
  result: BaseResult,
) {
  set(s => ({ base: result.state, ui: { ...s.ui, message: result.message } }));
}

/** Nome da região do mapa. Convenção: -z é norte, +x é leste. */
export function describeRegion(x: number, z: number): string {
  if (Math.hypot(x, z) < 12) return 'da Base';
  const ns = Math.abs(z) > 12 ? (z < 0 ? 'Norte' : 'Sul') : '';
  const lo = Math.abs(x) > 12 ? (x > 0 ? 'Leste' : 'Oeste') : '';
  if (ns && lo) {
    if (ns === 'Norte') return lo === 'Leste' ? 'Nordeste' : 'Noroeste';
    return lo === 'Leste' ? 'Sudeste' : 'Sudoeste';
  }
  return ns || lo || 'Central';
}
