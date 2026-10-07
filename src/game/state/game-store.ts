import { create } from 'zustand';
import type { PlayerState, CreatureState, ResourceNode, DeathBag, UIState, BaseState, BaseResult, BuildingId } from '../types';
import { ITEMS } from '../data/items';
import { CREATURES } from '../data/creatures';
import { createInventory, addItem, removeItem, getWeight, getUsedSlots, canAddItem, getDroppableItems, getItemCount } from '../systems/inventorySystem';
import { resolveAttack, getDistance } from '../systems/combatSystem';
import { createResourceNode, harvestNode, rollCreatureLoot, createDeathBag } from '../systems/lootSystem';
import { canCraft, craft } from '../systems/craftSystem';
import {
  createInitialBase, tickBase as resolveBase, placeBuilding as placeBaseBuilding, startUpgrade,
  enqueueUnit as enqueueBaseUnit, cancelQueueItem as cancelBaseQueueItem,
  sendExpedition as sendBaseExpedition, depositFromInventory, collectTools,
} from '../systems/baseSystem';

type GameState = {
  player: PlayerState;
  creatures: CreatureState[];
  resources: ResourceNode[];
  deathBags: DeathBag[];
  ui: UIState;
  attackTick: number;
  base: BaseState;
};

type GameActions = {
  attack: (targetId: string) => void;
  collect: (nodeId: string) => void;
  collectNearest: () => void;
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
};

function createInitialPlayer(): PlayerState {
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
  ]);

  return {
    id: 'player_1',
    name: 'Kael',
    classId: 'warrior',
    level: 1,
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
  };
}

function createInitialCreatures(): CreatureState[] {
  return [
    {
      id: 'wolf_1',
      speciesId: 'wolf',
      name: 'Lobo do Vale',
      hp: 80,
      maxHp: 80,
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
      hp: 80,
      maxHp: 80,
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
      hp: 80,
      maxHp: 80,
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

export const useGameStore = create<GameState & GameActions>((set, get) => ({
  player: createInitialPlayer(),
  creatures: createInitialCreatures(),
  resources: createInitialResources(),
  deathBags: [],
  attackTick: 0,
  base: createInitialBase(Date.now()),
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

    const now = Date.now() / 1000;
    if (now - state.player.lastAttackAt < state.player.attackCooldown) return;

    const dist = getDistance(state.player.position, creature.position);
    if (dist > 4) {
      set(s => ({ ui: { ...s.ui, message: `${creature.name} está longe demais.` } }));
      return;
    }

    const equippedWeapon = state.player.inventory.equipment.primary;
    const weaponPower = equippedWeapon ? (ITEMS[equippedWeapon]?.attackPower ?? 0) : 0;
    const totalPower = 10 + weaponPower;

    const result = resolveAttack(totalPower, creature.hp, creature.maxHp, creature.armor, creature.name);

    const updatedCreatures = state.creatures.map(c => {
      if (c.id !== targetId) return c;
      if (result.targetDied) {
        return { ...c, hp: 0, behavior: 'dead' as const, respawnAt: Date.now() + (180_000 + Math.random() * 120_000) };
      }
      return { ...c, hp: result.targetHp, behavior: 'chase' as const };
    });

    let updatedPlayer = { ...state.player, lastAttackAt: now };
    let updatedBags = state.deathBags;
    let msg = result.message;

    if (result.targetDied) {
      const def = CREATURES[creature.speciesId];
      if (def) {
        const loot = rollCreatureLoot(def);
        if (loot.length > 0) {
          const bag = createDeathBag(creature.id, creature.name, creature.position, loot);
          updatedBags = [...state.deathBags, bag];
          msg += ` Loot no chão!`;
        }
      }
      updatedPlayer = { ...updatedPlayer, gold: updatedPlayer.gold + 15 };
    }

    const creatureRetaliates = !result.targetDied;
    if (creatureRetaliates) {
      const dmgToPlayer = Math.max(1, creature.attackPower - 2);
      updatedPlayer = {
        ...updatedPlayer,
        hp: Math.max(0, updatedPlayer.hp - dmgToPlayer),
      };
      msg += ` Você recebeu ${dmgToPlayer} de dano.`;

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
      ui: { ...state.ui, message: msg },
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
    let nearest: ResourceNode | null = null;
    let bestDist = Infinity;
    for (const node of state.resources) {
      if (node.depleted) continue;
      const d = getDistance(state.player.position, node.position);
      if (d < bestDist) { bestDist = d; nearest = node; }
    }
    if (nearest && bestDist <= 4) {
      get().collect(nearest.id);
    } else {
      set(s => ({ ui: { ...s.ui, message: 'Nenhum recurso próximo.' } }));
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
      const newInv = removeItem(state.player.inventory, slot.itemId!, 1);
      const newHp = Math.min(state.player.maxHp, state.player.hp + item.healAmount);
      set({
        player: { ...state.player, hp: newHp, inventory: newInv },
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
}));

function applyBaseResult(
  set: (fn: (s: GameState) => Partial<GameState>) => void,
  result: BaseResult,
) {
  set(s => ({ base: result.state, ui: { ...s.ui, message: result.message } }));
}
