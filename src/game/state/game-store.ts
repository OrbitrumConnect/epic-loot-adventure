import { create } from 'zustand';
import type {
  PlayerState, CreatureState, ResourceNode, DeathBag, UIState, BaseState, BaseResult, BuildingId,
  CampState, ObjectiveQueueState, ObjectiveKind, AutoMode, AutoSnapshot, AutoIntent, Position,
  HarvestNodeState, FeedbackEvent,
} from '../types';
import { ITEMS } from '../data/items';
import { weaponFor, weaponRangeFor } from '../data/weapons';
import { maxAttackRange, type AutoWeapon, type PilotWeaponStyle } from '../systems/weaponChoiceSystem';
import { audioManager } from '../audio/audio-manager';
import { DEFAULT_ATTRIBUTES, type PlayerAttributes } from '../types/player';
import { CREATURES, ENEMY_RESPAWN_MULT, scaleEnemyHp } from '../data/creatures';
import { CAMPS, SAFE_ZONE, WORLD_HALF } from '../data/camps';
import { HARVEST_NODES, harvestRangeFor } from '../data/harvest-nodes';
import { DEV_INFINITE_POTIONS } from '../config/dev-flags';
import { createInventory, addItem, removeItem, getWeight, getUsedSlots, canAddItem, getDroppableItems, getItemCount } from '../systems/inventorySystem';
import { resolveAttack, getDistance } from '../systems/combatSystem';
import { createResourceNode, harvestNode, rollCreatureLoot, createDeathBag } from '../systems/lootSystem';
import { rollBonusLoot } from '../systems/lootEconomySystem';
import { canCraft, craft } from '../systems/craftSystem';
import {
  createInitialBase, tickBase as resolveBase, placeBuilding as placeBaseBuilding, startUpgrade,
  enqueueUnit as enqueueBaseUnit, cancelQueueItem as cancelBaseQueueItem,
  sendExpedition as sendBaseExpedition, depositFromInventory, collectTools,
} from '../systems/baseSystem';
import { createCamps, discoverCamps, tickCamps } from '../systems/campSystem';
import type { BaseType, BuildPreview, GridCell, PlayerBaseState } from '../types/playerbase';
import { BASE_TYPES, DEFAULT_BASE_TYPE } from '../data/base-types';
import { basePieceCost } from '../systems/baseTypeSystem';
import { CLAIM_SIZE } from '../data/base-pieces';
import { towerHeight } from '../systems/towerLevelSystem';
import { selectTowerTarget, towerDamage, type TowerSource } from '../systems/towerSystem';
import {
  advanceStage as advanceBaseStageOnce, advanceStageFully, canOpenCityView as cityViewOpen,
  claimBase as claimPlayerBase, damagePiece as damagePlayerPiece, placePieces as placePlayerPieces,
  cellInSquare as cellInBaseSquare, worldToCell as worldToBaseCell, cellKey as baseCellKey,
  cellCenter as baseCellCenter,
  upgradeTower as upgradePlayerTower,
} from '../systems/playerBaseSystem';
import {
  constructTrainingCamp as buildTrainingCamp, constructNextWall as buildNextWall,
  trainTroop as trainTroopSystem, upgradeTrainingCamp as upgradeTrainingCampSystem,
} from '../systems/trainingCampSystem';
import { baseLv1Layout, baseLv1Progress } from '../systems/baseLv1';
import {
  addObjective as addQueueObjective, clearObjectives as clearQueueObjectives, createQueue,
  findHealHotbarIndex, hasPendingObjective, removeObjective as removeQueueObjective,
  reorderObjective as reorderQueueObjective, setMode as setQueueMode, setRepeat as setQueueRepeat,
  tickObjectives,
} from '../systems/objectiveSystem';
import { HUNT_AREA_RADIUS } from '../systems/objectiveSystem';
import { creatureLevel, creatureXp, grantXp, playerBaseAttack, xpForLevel } from '../systems/progressionSystem';
import { damageMultiplier, playerCritStats, effectiveMaxWeight, effectiveSpecialCooldown, mitigateDamage, SKILL_STEP, SKILL_CAP_PER_ATTR } from '../systems/attributesSystem';
import { createHarvestNodes, harvestNode as harvestWorldNode, tickHarvestNodes } from '../systems/harvestSystem';
import { drinkBestPotion, findBestHealItem, shouldAutoDrink } from '../systems/potionSystem';
import { createWildCreatures } from '../systems/wildlifeSystem';
import { INITIAL_WAVE, tickWaves, waveEnemyCount, waveHpScale, markSpawned, type WaveState } from '../systems/waveSystem';
import { UPGRADE_CARDS, rollUpgradeChoices, towerDamageMult, wallHpMult, coreHpMult, type UpgradeId } from '../data/base-upgrades';
import { boomerangPositions, orbitCount, orbitDamage, ORBIT_HIT_RADIUS, ORBIT_TICK_MS, ORBIT_PUSH, ORBIT_BASE_WAVES, ORBIT_EXTEND_WAVES, tornadoPositions, tornadoCount, tornadoDamage, TORNADO_HIT_RADIUS, TORNADO_PUSH, TORNADO_BASE_WAVES, TORNADO_EXTEND_WAVES, dist2, type Vec2 } from '../systems/powerSystem';
import { SAVE_KEY } from '../systems/persistenceSystem';
import {
  damageEvent, deathEvent, harvestEvent, healEvent, levelUpEvent, lootEvent, pruneEvents, pushEvent,
  pushEvents, shotEvent, xpEvent,
} from '../systems/feedbackSystem';
import type { FeedbackDraft } from '../systems/feedbackSystem';
import { broadcastCreatureHit, canSimulateSharedWorld } from '@/net/multiplayer';

/** Para onde o piloto automático recua e para onde aponta um `travel` sem alvo. */
export const HOME_POSITION: Position = { x: 7, z: -26 };

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
  /** Base persistente no mundo (Fase 3). `null` = ainda não reivindicou terreno. */
  playerBase: PlayerBaseState | null;
  selectedBaseType: BaseType;
  /** Milissegundos por torre; separado das peças para não reconstruir malhas por tiro. */
  towerLastShotAt: Record<string, number>;
  /** Último tick dos powers orbitais (throttle do dano). */
  powerLastTickAt: number;
  /** Ciclo de HORDAS (Fase 5): paz ↔ combate, ondas cada vez mais difíceis. */
  wave: WaveState;
  /** Nível da base: sobe 1 a cada onda repelida (evolução por cartas). */
  baseLevel: number;
  /** Casa da base evoluiu p/ PEDRA (nível 10 + custo). Só troca a skin; dimensão/colisão iguais. */
  baseEvolved: boolean;
  baseMetal: boolean;
  /** Estatísticas da sobrevivência atual (ranking). kills = soma de huntSeen. */
  stats: { basesEvolved: number; basesLost: number; survivalStart: number };
  /** Quantas vezes cada evolução foi escolhida (stacks). */
  baseUpgrades: Record<UpgradeId, number>;
  /** 3 cartas oferecidas após repelir uma onda; null = sem escolha pendente. */
  upgradeChoices: UpgradeId[] | null;
  /** Onda até a qual os bumerangues duram (0 = inativo). Renovar estende. */
  orbitExpiresWave: number;
  /** Onda até a qual os tornados duram (0 = inativo). Renovar estende. */
  tornadoExpiresWave: number;
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
  /** Preferência de arma do piloto escolhida pelo jogador: 'auto' (default),
   *  'melee' ou 'ranged'. Entra no snapshot pra `pickWeaponFor` respeitar. */
  pilotWeaponStyle: PilotWeaponStyle;
  /** Última intenção do piloto, realimentada pelo executor pra dar histerese. */
  pilotLastIntent: AutoIntent | null;
  /** Eventos efêmeros (dano, XP, loot) para o mundo 3D e o HUD. Somem pelo `ttl`. */
  feedback: FeedbackEvent[];
};

type GameActions = {
  selectBaseType: (type: BaseType) => void;
  tickTowers: (towers: readonly TowerSource[], now: number, rng?: () => number) => void;
  upgradeTower: (pieceId: string) => void;
  /** Aplica o dano dos powers orbitais (bumerangues) na horda. Throttled. */
  tickPowers: (now: number) => void;
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
  /** Equipa um item da bolsa no slot certo pela categoria (arma/armadura/acessório). */
  equipItem: (itemId: string) => void;
  /** Tira o equipamento de um slot (volta pro "nu"). */
  unequipSlot: (slot: 'primary' | 'secondary' | 'armor' | 'accessory') => void;
  useHotbarSlot: (index: number, opts?: { manual?: boolean }) => void;
  /** Descarta (joga fora) o item do slot do inventário — tira da hotbar/equipamento também. */
  dropItem: (slotIndex: number) => void;
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
  /** Evolui a casa da base p/ PEDRA (exige nível 10 + madeira/pedra). */
  evolveBaseToStone: () => void;
  /** Evolui a casa p/ METAL (exige pedra + nível >20; custa 2.3x a pedra). */
  evolveBaseToMetal: () => void;
  enqueueUnit: (instanceId: string, unitId: string) => void;
  cancelQueueItem: (instanceId: string, itemId: string) => void;
  sendExpedition: (expeditionId: string, scouts: number) => void;
  depositToBase: () => void;
  /** Reivindica o quadrado de `CLAIM_SIZE` com canto em `origin`. `heightAt` = terrainHeight do mundo. */
  claimBase: (origin: GridCell, heightAt?: (x: number, z: number) => number) => void;
  placeBasePieces: (preview: BuildPreview, tier?: 1 | 2 | 3) => void;
  /** Entrega recursos da bolsa pra erguer a base até o Lv1 padrão (construção por %). */
  deliverToBase: () => void;
  constructTrainingCamp: () => void;
  constructNextWall: () => void;
  /** Treina uma tropa pela fila do Campo de Guerra; exige o centro físico construído. */
  trainTroop: (unitId: string) => void;
  /** Evolui o Campo de Guerra da cidade; exige o centro físico construído. */
  upgradeTrainingCamp: () => void;
  damageBasePiece: (pieceId: string, amount: number) => void;
  /** Sobe um estágio da base se a condição estiver cumprida. */
  advanceBaseStage: () => void;
  /** GAME OVER: recomeça a sobrevivência do zero (sem base/recurso). */
  restartSurvival: () => void;
  /** Escolhe uma das 3 cartas de evolução da base (entre ondas). */
  pickUpgrade: (id: UpgradeId) => void;
  /** A vista de cidade só abre com o perímetro fechado (`clash`). */
  canOpenCityView: () => boolean;
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
  setPilotWeaponStyle: (style: PilotWeaponStyle) => void;
  /** O executor do piloto (auto-pilot.tsx) realimenta a intenção do tique pra dar
   *  histerese à decisão do tique seguinte (banda morta, alvo pegajoso). */
  recordPilotIntent: (intent: AutoIntent | null) => void;
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

/** Caminho comum de morte para armas, especiais e defesa da base. */
function deadCreature(c: CreatureState, now: number, rng: () => number): CreatureState {
  const respawnAt = c.speciesId === 'raider_warlord'
    ? null
    : now + Math.round((180_000 + rng() * 120_000) * ENEMY_RESPAWN_MULT);
  return { ...c, hp: 0, behavior: 'dead', respawnAt };
}

/** Loot/XP seguem o mesmo caminho dos especiais, inclusive bônus de caça. */
function rewardCreatureDeath(c: CreatureState, player: PlayerState, bags: DeathBag[], drafts: FeedbackDraft[], rng: () => number) {
  const def = CREATURES[c.speciesId];
  if (def) {
    const loot = rollCreatureLoot(def, rng);
    const newHunt = (player.huntValue ?? 0) + creatureXp(def);
    const seen = player.huntSeen?.[c.speciesId] ?? 0;
    const bonus = rollBonusLoot(def, newHunt, seen, rng);
    player = { ...player, huntValue: newHunt, huntSeen: { ...(player.huntSeen ?? {}), [c.speciesId]: seen + 1 } };
    if (bonus) loot.push(bonus);
    // Loot vai DIRETO pro inventário, empilhando nos slots (madeira/pedra/bala/poção
    // acumulam; abre slot novo só quando enche). Sem saco, sem diálogo (Pedro). O que
    // NÃO couber (inventário/peso cheio) cai num saco no chão — nada se perde.
    let inv = player.inventory;
    const overflow: typeof loot = [];
    for (const drop of loot) {
      if (!drop.itemId) continue;
      drafts.push(lootEvent(drop.itemId, drop.quantity, c.position));
      if (canAddItem(inv, drop.itemId, drop.quantity)) inv = addItem(inv, drop.itemId, drop.quantity);
      else overflow.push(drop);
    }
    player = { ...player, inventory: inv };
    if (overflow.length) bags = [...bags, createDeathBag(c.id, c.name, c.position, overflow)];
  }
  const xpGain = creatureXp(def ?? c);
  const granted = grantXp({ ...player, gold: player.gold + 15 }, xpGain);
  player = syncCarry(granted.player);
  drafts.push(deathEvent(c.id, c.name, c.position), xpEvent(xpGain, player.position));
  if (granted.result.levelsGained > 0) drafts.push(levelUpEvent(granted.result.newLevel, player.position));
  return { player, bags };
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
    { itemId: 'ammo', quantity: 60 }, // munição inicial p/ pistola/rifle
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
    position: { x: 7, z: -25 },
    inventory,
    attackCooldown: 0.8,
    lastAttackAt: 0,
    dead: false,
    respawnAt: 0,
    lastSpecialAt: 0,
    attributes: { ...DEFAULT_ATTRIBUTES },
    skillPoints: 0,
    huntValue: 0,
    huntSeen: {},
  };
}

function createInitialCreatures(): CreatureState[] {
  return [
    {
      id: 'wolf_1',
      speciesId: 'wolf',
      name: 'Raposa do Vale',
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
      name: 'Raposa do Vale',
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
      name: 'Raposa do Vale',
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

const WAVE_SPECIES = ['raider_scout', 'raider_warrior', 'raider_puglin', 'raider_brute', 'raider_shaman', 'pelter'] as const;

/** Nº de bosses na onda — cresce com as ondas (teto 5). */
function waveBossCount(wave: number): number {
  return Math.min(5, Math.ceil(wave / 2)); // onda 1-2:1, 3-4:2, 5-6:3...
}

/**
 * Qual boss nasce. Ondas maiores liberam bosses MAIORES; o 1º boss da onda é o
 * mais forte disponível, o resto varia pra horda ficar mista.
 *  - onda 1: só Colosso (warlord)
 *  - onda 2-3: Samurai aparece
 *  - onda 4-5: Fúngico aparece
 *  - onda 6+: Kaiju aparece (o gigante) — adiantado a pedido do Pedro
 */
function waveBossSpecies(wave: number, index: number): string {
  if (wave >= 6) {
    if (index === 0) return 'raider_mushroom'; // kaiju removido (Aberração já faz o papel)
    const pool = ['raider_mushroom', 'raider_samurai', 'raider_warlord'];
    return pool[index % pool.length]!;
  }
  if (wave >= 4) {
    if (index === 0) return 'raider_mushroom';
    return index % 2 === 0 ? 'raider_samurai' : 'raider_warlord';
  }
  if (wave >= 2) return index === 0 ? 'raider_samurai' : 'raider_warlord';
  return 'raider_warlord';
}

/** Centro (core) da base, pra as hordas mirarem. null se não houver base. */
function baseCenter(base: PlayerBaseState | null): { x: number; z: number } | null {
  if (!base) return null;
  const core = base.pieces.find((p) => p.kind === 'core');
  return core ? baseCellCenter(core.cell) : null;
}

/** Cria os raiders de uma onda ao redor da base (eles marcham até ela — ver hostile-ai). */
function spawnWaveRaiders(wave: number, center: { x: number; z: number }, now: number): CreatureState[] {
  const hpScale = waveHpScale(wave);
  const clamp = (v: number) => Math.max(-WORLD_HALF + 2, Math.min(WORLD_HALF - 2, v));
  const out: CreatureState[] = [];
  const mk = (sp: string, i: number, tag: string, hpMul = 1) => {
    const def = CREATURES[sp];
    if (!def) return;
    const total = waveEnemyCount(wave) + waveBossCount(wave);
    const ang = (i / Math.max(1, total)) * Math.PI * 2 + Math.random() * 0.5;
    const r = 34 + Math.random() * 14; // nascem BEM fora da vista, marcham até a base
    const hp = Math.round(scaleEnemyHp(def.maxHp) * hpScale * hpMul);
    out.push({
      id: `wave${wave}_${tag}${i}_${now}`,
      speciesId: sp,
      name: def.name,
      hp, maxHp: hp,
      attackPower: def.attackPower,
      armor: def.armor,
      attackCooldown: def.attackCooldown,
      lastAttackAt: 0,
      position: { x: clamp(center.x + Math.sin(ang) * r), z: clamp(center.z + Math.cos(ang) * r) },
      behavior: 'patrol',
      lootTable: [],
      respawnAt: null,
    });
  };
  const count = waveEnemyCount(wave);
  for (let i = 0; i < count; i++) mk(WAVE_SPECIES[i % WAVE_SPECIES.length]!, i, '', 1);
  const bosses = waveBossCount(wave);
  for (let b = 0; b < bosses; b++) mk(waveBossSpecies(wave, b), count + b, 'boss', 1.2); // bosses da onda
  return out;
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
  playerBase: null,
  selectedBaseType: DEFAULT_BASE_TYPE,
  towerLastShotAt: {},
  powerLastTickAt: 0,
  wave: INITIAL_WAVE,
  baseLevel: 1,
  baseEvolved: false,
  baseMetal: false,
  stats: { basesEvolved: 0, basesLost: 0, survivalStart: Date.now() },
  baseUpgrades: { tower_damage: 0, wall_hp: 0, base_repair: 0, core_hp: 0, orbit_boomerang: 0, tornado: 0 },
  upgradeChoices: null,
  orbitExpiresWave: 0,
  tornadoExpiresWave: 0,
  camps: INITIAL_CAMP_WORLD.camps,
  objectives: createQueue(),
  targetId: null,
  harvestNodes: createHarvestNodes(),
  autoPotion: true,
  autoHuntRadius: 35,
  pilotWeaponStyle: 'auto',
  pilotLastIntent: null,
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

  upgradeTower: (pieceId) => {
    const state = get();
    if (!state.playerBase) return;
    const result = upgradePlayerTower(state.playerBase, pieceId, state.player.inventory);
    set({ playerBase: result.base, player: result.ok ? { ...state.player, inventory: result.inventory } : state.player,
      ui: { ...state.ui, message: result.message } });
  },

  tickTowers: (towers, now, rng = Math.random) => {
    // Nenhuma escrita/alocação nos quadros sem disparo. Cada torre lê o resultado
    // da anterior, portanto duas torres não premiam a mesma morte.
    for (const tower of towers) {
      const state = get();
      const index = selectTowerTarget(tower, state.creatures, state.towerLastShotAt[tower.id], now);
      if (index < 0) continue;
      const c = state.creatures[index]!;
      // Dano base da torre (Caio) × multiplicador das cartas de evolução (hordas).
      const damage = towerDamage(tower, c, rng) * towerDamageMult(state.baseUpgrades.tower_damage);
      const hp = Math.max(0, c.hp - damage);
      const drafts = [shotEvent(tower, c.position, 'arrow', towerHeight(tower.tier, tower.level)), damageEvent(c.id, damage, c.position)];
      let player = state.player;
      let deathBags = state.deathBags;
      if (hp === 0) {
        const reward = rewardCreatureDeath(c, player, deathBags, drafts, rng);
        player = reward.player;
        deathBags = reward.bags;
      }
      const creatures = state.creatures.slice();
      creatures[index] = hp === 0 ? deadCreature(c, now, rng) : { ...c, hp };
      set({ creatures, player, deathBags,
        towerLastShotAt: { ...state.towerLastShotAt, [tower.id]: now },
        feedback: pushEvents(state.feedback, drafts, now),
      });
    }
  },

  tickPowers: (now) => {
    const state = get();
    if (!state.playerBase) return;
    const core = state.playerBase.pieces.find((p) => p.kind === 'core');
    if (!core) return;
    if (now - state.powerLastTickAt < ORBIT_TICK_MS) return; // tick comum dos powers
    const center = baseCellCenter(core.cell);
    const wave = state.wave.wave;

    // Campos de dano ATIVOS (bumerangue + tornado), cada um com suas posições,
    // dano, raio² e empurrão. Power temporário: só entra dentro da duração.
    type Field = { positions: Vec2[]; r2: number; dmg: number; push: number };
    const fields: Field[] = [];
    const orb = state.baseUpgrades.orbit_boomerang;
    if (orb > 0 && wave <= state.orbitExpiresWave) {
      fields.push({ positions: boomerangPositions(center, orbitCount(orb), now), r2: ORBIT_HIT_RADIUS * ORBIT_HIT_RADIUS, dmg: orbitDamage(orb), push: ORBIT_PUSH });
    }
    const tor = state.baseUpgrades.tornado;
    if (tor > 0 && wave <= state.tornadoExpiresWave) {
      fields.push({ positions: tornadoPositions(center, tornadoCount(tor), now), r2: TORNADO_HIT_RADIUS * TORNADO_HIT_RADIUS, dmg: tornadoDamage(tor), push: TORNADO_PUSH });
    }
    if (fields.length === 0) return;

    let player = state.player;
    let deathBags = state.deathBags;
    const drafts: ReturnType<typeof damageEvent>[] = [];
    const next = state.creatures.slice();
    let changed = false;
    for (let i = 0; i < next.length; i++) {
      const c = next[i]!;
      if (c.hp <= 0 || c.behavior === 'dead') continue;
      if (CREATURES[c.speciesId]?.peaceful) continue; // power não corta bicho pacífico
      let dmg = 0;
      let push = 0;
      for (const f of fields) {
        if (f.positions.some((p) => dist2(p, c.position) <= f.r2)) {
          if (f.dmg > dmg) dmg = f.dmg;
          if (f.push > push) push = f.push;
        }
      }
      if (dmg <= 0) continue;
      const hp = Math.max(0, c.hp - dmg);
      drafts.push(damageEvent(c.id, dmg, c.position));
      if (hp === 0) {
        const reward = rewardCreatureDeath(c, player, deathBags, drafts, Math.random);
        player = reward.player;
        deathBags = reward.bags;
        next[i] = deadCreature(c, now, Math.random);
      } else {
        // Empurrão pra FORA da base (a lâmina/vendaval bate e afasta).
        const dx = c.position.x - center.x;
        const dz = c.position.z - center.z;
        const len = Math.hypot(dx, dz) || 1;
        next[i] = { ...c, hp, position: { x: c.position.x + (dx / len) * push, z: c.position.z + (dz / len) * push } };
      }
      changed = true;
    }
    if (!changed) { set({ powerLastTickAt: now }); return; }
    set({
      creatures: next, player, deathBags, powerLastTickAt: now,
      feedback: pushEvents(state.feedback, drafts, now),
    });
  },

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
    if (dist > weaponRangeFor(heldItemId, state.player.level)) {
      set(s => ({ ui: { ...s.ui, message: `${creature.name} está longe demais.` } }));
      return;
    }

    // Munição: armas de BALA (pistola/rifle) gastam 1 por tiro. Sem bala, não
    // atira (arco usa flecha, é livre). Pega bala dos saqueadores/acampamentos.
    const usesBullet = prof.projectile === 'bullet';
    if (usesBullet && getItemCount(state.player.inventory, 'ammo') <= 0) {
      set(s => ({ ui: { ...s.ui, message: 'Sem munição! Pegue balas dos saqueadores ou limpe um acampamento.' } }));
      return;
    }

    // Poder da arma ATIVA = a que está na MÃO (hotbar), não o slot
    // `equipment.primary`. Antes o ramo melee lia `equipment.primary`, que começa
    // `null` e só é preenchido quando o jogador/piloto SELECIONA o slot
    // (`useHotbarSlot`). Com a espada inicial na mão mas `primary` ainda `null`, o
    // golpe saía só com `playerBaseAttack` (10 no nível 1): contra a Couraça de
    // Espinhos (armor 18 → redução 9, 2070 HP) o dano caía ao piso de 1-2 e a barra
    // não andava — daí o "não ataca com arma nenhuma". O ramo ranged já lia a arma
    // da mão; agora o melee faz igual, então a arma empunhada sempre entra no dano.
    const heldWeaponPower = heldItemId ? (ITEMS[heldItemId]?.attackPower ?? 0) : 0;
    const TORCH_FIRE_BONUS = 9;
    const base = playerBaseAttack(state.player.level);
    const totalPower = usingTorch
      ? base + TORCH_FIRE_BONUS
      : base + heldWeaponPower;

    // Atributo de dano (%): multiplica o poder final. Nível 1 sem equip = ×1 (sem mudança).
    const finalPower = Math.round(totalPower * damageMultiplier(state.player));

    // Em sala convidada o inimigo pertence ao anfitrião. O convidado conserva
    // apenas o próprio cooldown/munição e envia a intenção do golpe; a vida
    // comum volta no snapshot do anfitrião para todos os jogadores.
    if (!canSimulateSharedWorld()) {
      broadcastCreatureHit({ targetId, source: state.player.position, damage: finalPower });
      set({
        player: {
          ...state.player,
          lastAttackAt: now,
          inventory: usesBullet ? removeItem(state.player.inventory, 'ammo', 1) : state.player.inventory,
        },
        attackTick: state.attackTick + 1,
        ui: { ...state.ui, message: `Golpe enviado contra ${creature.name}.` },
      });
      return;
    }

    const result = resolveAttack(finalPower, creature.hp, creature.maxHp, creature.armor, creature.name, playerCritStats(state.player));

    const updatedCreatures = state.creatures.map(c => {
      if (c.id !== targetId) return c;
      if (result.targetDied) {
        return deadCreature(c, Date.now(), Math.random);
      }
      return { ...c, hp: result.targetHp, behavior: 'chase' as const };
    });

    let updatedPlayer = {
      ...state.player, lastAttackAt: now,
      inventory: usesBullet ? removeItem(state.player.inventory, 'ammo', 1) : state.player.inventory,
    };
    let updatedBags = state.deathBags;
    let msg = result.message;
    const stamp = Date.now();
    const drafts: FeedbackDraft[] = [
      damageEvent(creature.id, result.damage, creature.position, {
        critical: !!result.critical,
        fire: usingTorch,
      }),
    ];
    // Ranged: projétil visual do jogador até o alvo.
    if (usingRanged && prof.projectile) {
      drafts.push(shotEvent(state.player.position, creature.position, prof.projectile));
    }
    // Áudio por arma: arco = flecha, pistola/rifle = tiro, senão melee.
    if (heldItemId === 'bow') audioManager.playShot();
    else if (heldItemId === 'pistol' || heldItemId === 'rifle') audioManager.playGunShot();
    else if (!usingRanged) audioManager.playMelee();

    if (result.targetDied) {
      const def = CREATURES[creature.speciesId];
      if (def) {
        const loot = rollCreatureLoot(def);
        // Economia de loot: acumula valor de caça e rola um bônus de raridade
        // por marco (aditivo à lootTable; diminishing por espécie).
        const newHunt = (updatedPlayer.huntValue ?? 0) + creatureXp(def);
        const seen = updatedPlayer.huntSeen?.[creature.speciesId] ?? 0;
        const bonus = rollBonusLoot(def, newHunt, seen);
        updatedPlayer = {
          ...updatedPlayer,
          huntValue: newHunt,
          huntSeen: { ...(updatedPlayer.huntSeen ?? {}), [creature.speciesId]: seen + 1 },
        };
        if (bonus) loot.push(bonus);
        for (const drop of loot) {
          if (drop.itemId) drafts.push(lootEvent(drop.itemId, drop.quantity, creature.position));
        }
        if (loot.length > 0) {
          const bag = createDeathBag(creature.id, creature.name, creature.position, loot);
          updatedBags = [...state.deathBags, bag];
          msg += bonus ? ` ✦ ${ITEMS[bonus.itemId]?.name ?? 'Raro'} dropou!` : ` Loot no chão!`;
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
      const dmgToPlayer = mitigateDamage(Math.max(1, creature.attackPower - 2), updatedPlayer);
      updatedPlayer = {
        ...updatedPlayer,
        hp: Math.max(0, updatedPlayer.hp - dmgToPlayer),
        // Sinal de agressão sofrida (ver RECENT_DAMAGE_WINDOW_MS): combate > farm.
        lastDamagedAt: stamp,
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
    // Mesmo conserto do `attack`: a arma da MÃO entra no dano, não `equipment.primary`
    // (que pode estar `null` enquanto o slot não foi selecionado via `useHotbarSlot`).
    const heldWeaponPower = heldId ? (ITEMS[heldId]?.attackPower ?? 0) : 0;
    const base = playerBaseAttack(state.player.level) + (usingTorch ? 9 : heldWeaponPower);
    const dmgMult = damageMultiplier(state.player);
    const critStats = playerCritStats(state.player);
    // Jump: dano alto, raio menor. Spin: 360°, raio maior, dano menor.
    const radius = kind === 'spin' ? 3.8 : 3.2;
    const power = Math.round(base * (kind === 'jump' ? 1.8 : 1.2) * dmgMult);

    const pos = state.player.position;
    const drafts: FeedbackDraft[] = [];
    let updatedPlayer: PlayerState = { ...state.player, lastSpecialAt: now };
    let updatedBags = state.deathBags;
    let hits = 0;
    audioManager.playMelee(); // especial (salto/giro) = melee

    const creatures = state.creatures.map(c => {
      if (c.behavior === 'dead') return c;
      if (getDistance(pos, c.position) > radius) return c;
      hits += 1;
      const result = resolveAttack(power, c.hp, c.maxHp, c.armor, c.name, critStats);
      drafts.push(damageEvent(c.id, result.damage, c.position, {
        critical: !!result.critical, fire: usingTorch,
      }));
      if (result.targetDied) {
        const reward = rewardCreatureDeath(c, updatedPlayer, updatedBags, drafts, Math.random);
        updatedPlayer = reward.player;
        updatedBags = reward.bags;
        return deadCreature(c, Date.now(), Math.random);
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
      if (d <= harvestRangeFor(def.range, state.player.level) + 0.5 && d < bestNodeDist) { bestNodeDist = d; bestNode = node; }
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

  useHotbarSlot: (index: number, opts?: { manual?: boolean }) => {
    const state = get();
    const invSlotIdx = state.player.inventory.hotbar.slots[index];
    if (invSlotIdx == null) return;

    const slot = state.player.inventory.slots[invSlotIdx];
    if (!slot?.itemId) return;

    const item = ITEMS[slot.itemId];
    if (!item) return;

    // Seleção MANUAL (jogador) de uma ARMA define o estilo do piloto idle: pegar
    // pistola/rifle/arco = 'ranged'; espada/machado/picareta = 'melee'. Assim a sua
    // escolha na hotbar MANDA (o piloto parava de usar a pistola e voltava pra espada
    // no estilo 'auto'). NÃO fazer isso quando o PRÓPRIO piloto troca (opts.manual=false),
    // senão a troca dele realimentaria o estilo e travaria.
    if (opts?.manual !== false && item.equippable) {
      const ranged = weaponFor(item.id).ranged;
      const isWeapon = ranged || (item.attackPower ?? 0) > 0;
      if (isWeapon) set({ pilotWeaponStyle: ranged ? 'ranged' : 'melee' });
    }

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

  dropItem: (slotIndex) => {
    const state = get();
    const itemId = state.player.inventory.slots[slotIndex]?.itemId;
    const quantity = itemId ? state.player.inventory.slots[slotIndex]!.quantity : 0;
    if (!itemId || quantity <= 0) return;
    const inventory = { ...state.player.inventory, slots: state.player.inventory.slots.map((slot, i) => i === slotIndex ? { itemId: null, quantity: 0 } : { ...slot }) };
    const hotbar = inventory.hotbar.slots.map(si => (si != null && inventory.slots[si]?.itemId) ? si : null);
    const equipment = { ...inventory.equipment };
    (Object.keys(equipment) as (keyof typeof equipment)[]).forEach(slot => { if (equipment[slot] === itemId) equipment[slot] = null; });
    set({ player: { ...state.player, inventory: { ...inventory, hotbar: { ...inventory.hotbar, slots: hotbar }, equipment } }, ui: { ...state.ui, message: `${ITEMS[itemId]?.name ?? itemId} descartado.` } });
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
    // UM boss ambiente por vez (qualquer espécie com id boss_ viva).
    if (state.creatures.some(c => c.id.startsWith('boss_') && c.behavior !== 'dead')) return;
    // Sorteia o boss que ronda o MAPA: Colosso, Fúngico, Samurai ou Kaiju —
    // os mesmos das ondas aparecem soltos no vale também (pedido do Pedro).
    const POOL = ['raider_warlord', 'raider_mushroom', 'raider_samurai']; // kaiju removido
    const sp = POOL[Math.floor(Math.random() * POOL.length)]!;
    const def = CREATURES[sp];
    if (!def) return;
    const p = state.player.position;
    const margin = WORLD_HALF - 6;
    // Nasce 22–34 m do jogador, direção aleatória, dentro do mundo.
    let x = Math.max(-margin, Math.min(margin, p.x + 20));
    let z = p.z;
    // Nasce 16–26 m do jogador: longe o bastante pra ser um susto, perto o
    // bastante pra já entrar no aggro (30) e vir caçar imediatamente.
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 16 + Math.random() * 10;
      const cx = Math.max(-margin, Math.min(margin, p.x + Math.sin(ang) * r));
      const cz = Math.max(-margin, Math.min(margin, p.z + Math.cos(ang) * r));
      if (getDistance(p, { x: cx, z: cz }) >= 14) { x = cx; z = cz; break; }
    }
    const hp = scaleEnemyHp(def.maxHp);
    const boss: CreatureState = {
      id: `boss_${Date.now()}`,
      speciesId: sp,
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

  equipItem: (itemId) => {
    const item = ITEMS[itemId];
    if (!item || !item.equippable) return;
    // Roteia pelo tipo: armadura → armor, resto (arma/ferramenta) → primary.
    const slot: 'primary' | 'armor' | 'accessory' =
      item.equipSlot === 'accessory' ? 'accessory' : item.category === 'armor' ? 'armor' : 'primary';
    set(s => {
      const inv = s.player.inventory;
      let hotbar = inv.hotbar;
      // Arma: além de equipar, coloca no SLOT ATIVO da hotbar pra ficar na mão e
      // usar o perfil dela (alcance/anim). Tocha fica fora disso (não é equipável).
      if (slot === 'primary') {
        const invIdx = inv.slots.findIndex(sl => sl.itemId === itemId);
        if (invIdx >= 0) {
          const slots = [...hotbar.slots];
          slots[s.ui.selectedHotbar] = invIdx;
          hotbar = { ...hotbar, slots };
        }
      }
      return {
        // armadura/acessório mexem em carga% → peso máx acompanha.
        player: syncCarry({
          ...s.player,
          inventory: { ...inv, hotbar, equipment: { ...inv.equipment, [slot]: itemId } },
        }),
        ui: { ...s.ui, message: `${item.name} equipado.` },
      };
    });
  },

  unequipSlot: (slot) => {
    set(s => {
      const current = s.player.inventory.equipment[slot];
      if (!current) return {};
      const name = ITEMS[current]?.name ?? 'Item';
      return {
        player: syncCarry({
          ...s.player,
          inventory: { ...s.player.inventory, equipment: { ...s.player.inventory.equipment, [slot]: null } },
        }),
        ui: { ...s.ui, message: `${name} desequipado.` },
      };
    });
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

  evolveBaseToStone: () => {
    const s = get();
    if (s.baseEvolved) return;
    const LEVEL = 10, WOOD = 100, STONE = 200;
    if ((s.player.level ?? 1) < LEVEL) {
      set({ ui: { ...s.ui, message: `Casa de pedra: precisa ser nível ${LEVEL}.` } });
      return;
    }
    const inv = s.player.inventory;
    const w = getItemCount(inv, 'wood'), st = getItemCount(inv, 'stone');
    if (w < WOOD || st < STONE) {
      set({ ui: { ...s.ui, message: `Falta material: ${WOOD} madeira + ${STONE} pedra (tem ${w}/${st}).` } });
      return;
    }
    let nextInv = removeItem(inv, 'wood', WOOD);
    nextInv = removeItem(nextInv, 'stone', STONE);
    set({ baseEvolved: true, stats: { ...s.stats, basesEvolved: s.stats.basesEvolved + 1 }, player: syncCarry({ ...s.player, inventory: nextInv }), ui: { ...s.ui, message: 'Casa evoluída para PEDRA! 🏰' } });
  },

  evolveBaseToMetal: () => {
    const s = get();
    if (s.baseMetal) return;
    if (!s.baseEvolved) {
      set({ ui: { ...s.ui, message: 'Casa de metal: evolua para PEDRA primeiro.' } });
      return;
    }
    const LEVEL = 20, WOOD = 230, STONE = 460; // 2.3x da pedra (100/200)
    if ((s.player.level ?? 1) <= LEVEL) {
      set({ ui: { ...s.ui, message: `Casa de metal: precisa ser acima do nível ${LEVEL}.` } });
      return;
    }
    const inv = s.player.inventory;
    const w = getItemCount(inv, 'wood'), st = getItemCount(inv, 'stone');
    if (w < WOOD || st < STONE) {
      set({ ui: { ...s.ui, message: `Falta material: ${WOOD} madeira + ${STONE} pedra (tem ${w}/${st}).` } });
      return;
    }
    let nextInv = removeItem(inv, 'wood', WOOD);
    nextInv = removeItem(nextInv, 'stone', STONE);
    set({ baseMetal: true, stats: { ...s.stats, basesEvolved: s.stats.basesEvolved + 1 }, player: syncCarry({ ...s.player, inventory: nextInv }), ui: { ...s.ui, message: 'Casa evoluída para METAL! ⚙️' } });
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

  selectBaseType: type => {
    if (!get().playerBase && Object.hasOwn(BASE_TYPES, type)) set({ selectedBaseType: type });
  },

  claimBase: (origin, heightAt) => {
    const state = get();
    if (state.playerBase) {
      set({ ui: { ...state.ui, message: 'Você já tem uma base.' } });
      return;
    }
    const owner = { kind: 'player' as const, id: state.player.id, name: state.player.name };
    const result = claimPlayerBase(origin, CLAIM_SIZE, owner, { bases: [], heightAt }, Date.now(), state.selectedBaseType);
    const base = result.base;
    if (!base) { set({ ui: { ...state.ui, message: result.message } }); return; }
    // Limpa o terreno reivindicado: tira madeira/pedra/árvore dentro do quadrado da base.
    const clearedHarvest = state.harvestNodes.filter(
      n => !cellInBaseSquare(worldToBaseCell(n.position), base.origin, base.size),
    );
    const clearedResources = state.resources.filter(
      r => !cellInBaseSquare(worldToBaseCell(r.position), base.origin, base.size),
    );
    const removed = (state.harvestNodes.length - clearedHarvest.length) + (state.resources.length - clearedResources.length);
    set({
      playerBase: base,
      harvestNodes: clearedHarvest,
      resources: clearedResources,
      ui: { ...state.ui, message: removed > 0 ? `${result.message} Terreno limpo.` : result.message },
    });
  },

  constructTrainingCamp: () => {
    const s = get();
    const result = buildTrainingCamp(s.base, s.playerBase, s.player.inventory, Date.now());
    set({ base: result.base, playerBase: result.playerBase, player: { ...s.player, inventory: result.inventory }, ui: { ...s.ui, message: result.message } });
  },

  constructNextWall: () => {
    const s = get();
    const result = buildNextWall(s.playerBase, s.player.inventory, Date.now());
    set({ playerBase: result.playerBase, player: { ...s.player, inventory: result.inventory }, ui: { ...s.ui, message: result.message } });
  },

  trainTroop: (unitId) => {
    const s = get();
    const result = trainTroopSystem(s.base, s.playerBase, unitId, Date.now());
    applyBaseResult(set, result);
  },

  upgradeTrainingCamp: () => {
    const s = get();
    const result = upgradeTrainingCampSystem(s.base, s.playerBase, Date.now());
    applyBaseResult(set, result);
  },

  deliverToBase: () => {
    const s = get();
    const pb = s.playerBase;
    if (!pb) { set({ ui: { ...s.ui, message: 'Reivindique um terreno primeiro (abra o Mapa e posicione a base).' } }); return; }
    const layout = baseLv1Layout(pb.origin, pb.size);
    const have = new Set(pb.pieces.map(p => baseCellKey(p.cell)));
    let base = pb;
    let inv = s.player.inventory;
    let placed = 0;
    // Entrega o que der: cada peça ainda não erguida é cobrada da bolsa e colocada.
    for (const piece of layout) {
      if (have.has(baseCellKey(piece.cell))) continue;
      const preview: BuildPreview = { cells: [piece.cell], kind: piece.kind, rotation: piece.rotation, cost: basePieceCost(piece.kind, 1, pb.baseType), blocked: [], affordable: true };
      const res = placePlayerPieces(base, preview, inv, Date.now(), 1);
      if (!res.ok) continue; // sem material pra esta peça; tenta as próximas
      base = res.base;
      inv = res.inventory;
      have.add(baseCellKey(piece.cell));
      placed += 1;
    }
    base = advanceStageFully(base);
    const prog = baseLv1Progress(base);
    const message = placed > 0
      ? (prog.pct >= 100 ? 'Base Nível 1 concluída! 🏯 O Clash abriu.' : `Construção: ${prog.pct}% (+${placed} peças). Farme mais madeira/pedra.`)
      : (prog.pct >= 100 ? 'A base já está no Nível 1.' : 'Sem material. Farme madeira/pedra e volte pra entregar.');
    console.log('[BASE] construir (martelo): +' + placed + ' peças · progresso ' + prog.pct + '% · ' + message);
    set({ playerBase: base, player: { ...s.player, inventory: inv }, ui: { ...s.ui, message } });
  },

  placeBasePieces: (preview, tier = 1) => {
    const state = get();
    if (!state.playerBase) return;
    const result = placePlayerPieces(state.playerBase, preview, state.player.inventory, Date.now(), tier);
    if (!result.ok) {
      set({ ui: { ...state.ui, message: result.message } });
      return;
    }
    set({
      playerBase: advanceStageFully(result.base),
      player: { ...state.player, inventory: result.inventory },
      ui: { ...state.ui, message: result.message },
    });
  },

  damageBasePiece: (pieceId, amount) => {
    const state = get();
    if (!state.playerBase) return;
    const result = damagePlayerPiece(state.playerBase, pieceId, amount, Date.now());
    const message = result.wiped
      ? 'Sua base foi destruída.'
      : result.reopened
        ? 'Brecha no muro! A base está aberta.'
        : state.ui.message;
    if (result.wiped) {
      // Base CAIU na horda → GAME OVER. Para as ondas, limpa os inimigos de onda.
      // Penalidade (Pedro): perde 5 NÍVEIS por base perdida (piso 1), mantendo o resto
      // (itens, atributos, HP). Assim o progresso NÃO zera — o jogador continua vivo e
      // querendo evoluir. 5→1, 10→5, 15→10, 20→15...
      const lostLevel = Math.max(1, state.player.level - 5);
      const penalized = lostLevel < state.player.level
        ? { ...state.player, level: lostLevel, xp: 0, xpToNext: xpForLevel(lostLevel) }
        : state.player;
      const penaltyMsg = lostLevel < state.player.level
        ? `${message} Você perdeu 5 níveis (${state.player.level}→${lostLevel}); o resto do progresso continua.`
        : message;
      set({
        player: penalized,
        stats: { ...state.stats, basesLost: state.stats.basesLost + 1 },
        playerBase: null,
        wave: INITIAL_WAVE,
        baseLevel: 1,
        baseUpgrades: { tower_damage: 0, wall_hp: 0, base_repair: 0, core_hp: 0, orbit_boomerang: 0, tornado: 0 },
        upgradeChoices: null,
        orbitExpiresWave: 0,
        tornadoExpiresWave: 0,
        creatures: state.creatures.filter((c) => !c.id.startsWith('wave')),
        ui: { ...state.ui, message: penaltyMsg, baseFell: true },
      });
      return;
    }
    set({
      playerBase: result.base,
      ui: { ...state.ui, message },
    });
  },

  restartSurvival: () => {
    // "Sobreviver de novo": recomeça do zero (sem base, sem recurso), mundo limpo.
    try { localStorage.removeItem(SAVE_KEY); } catch { /* storage bloqueado */ }
    set((s) => ({
      player: createInitialPlayer(),
      creatures: [...createInitialCreatures(), ...createWildCreatures(), ...createCamps(Date.now()).creatures],
      resources: createInitialResources(),
      harvestNodes: createHarvestNodes(),
      deathBags: [],
      playerBase: null,
      towerLastShotAt: {},
      wave: INITIAL_WAVE,
      baseLevel: 1,
      baseUpgrades: { tower_damage: 0, wall_hp: 0, base_repair: 0, core_hp: 0, orbit_boomerang: 0, tornado: 0 },
      upgradeChoices: null,
      orbitExpiresWave: 0,
      tornadoExpiresWave: 0,
      stats: { basesEvolved: 0, basesLost: 0, survivalStart: Date.now() },
      objectives: createQueue(),
      ui: { ...s.ui, baseFell: false, message: '🔥 Nova sobrevivência! Colete, construa a base e prepare as defesas.' },
    }));
  },

  pickUpgrade: (id) => {
    set((state) => {
      if (!state.upgradeChoices || !state.upgradeChoices.includes(id)) return {};
      // Powers TEMPORÁRIOS (bumerangue/tornado): ativo → renova (+1 e +2 ondas);
      // do zero/expirado → recomeça (duração base). Os demais só acumulam stack.
      let orbitExpiresWave = state.orbitExpiresWave;
      let tornadoExpiresWave = state.tornadoExpiresWave;
      let stacks: number;
      if (id === 'orbit_boomerang') {
        const active = (state.baseUpgrades.orbit_boomerang ?? 0) > 0 && state.wave.wave <= state.orbitExpiresWave;
        stacks = active ? state.baseUpgrades.orbit_boomerang + 1 : 1;
        orbitExpiresWave = (active ? state.orbitExpiresWave : state.wave.wave) + (active ? ORBIT_EXTEND_WAVES : ORBIT_BASE_WAVES);
      } else if (id === 'tornado') {
        const active = (state.baseUpgrades.tornado ?? 0) > 0 && state.wave.wave <= state.tornadoExpiresWave;
        stacks = active ? state.baseUpgrades.tornado + 1 : 1;
        tornadoExpiresWave = (active ? state.tornadoExpiresWave : state.wave.wave) + (active ? TORNADO_EXTEND_WAVES : TORNADO_BASE_WAVES);
      } else {
        stacks = (state.baseUpgrades[id] ?? 0) + 1;
      }
      const baseUpgrades = { ...state.baseUpgrades, [id]: stacks };
      // Efeito nas peças da base (torre é multiplicador no tiro, não mexe em peça).
      let playerBase = state.playerBase;
      if (playerBase) {
        const pieces = playerBase.pieces.map((p) => {
          if (id === 'wall_hp') {
            const maxHp = Math.round(p.maxHp * wallHpMult());
            return { ...p, maxHp, hp: maxHp };
          }
          if (id === 'base_repair') return { ...p, hp: p.maxHp };
          if (id === 'core_hp' && p.kind === 'core') {
            const maxHp = Math.round(p.maxHp * coreHpMult());
            return { ...p, maxHp, hp: maxHp };
          }
          return p;
        });
        playerBase = { ...playerBase, pieces };
      }
      const card = UPGRADE_CARDS[id];
      return {
        baseUpgrades,
        playerBase,
        baseLevel: state.baseLevel + 1,
        upgradeChoices: null,
        orbitExpiresWave,
        tornadoExpiresWave,
        ui: { ...state.ui, message: `🏛️ Base nível ${state.baseLevel + 1}: ${card.name}!` },
      };
    });
  },

  advanceBaseStage: () => {
    const state = get();
    if (!state.playerBase) return;
    set({ playerBase: advanceBaseStageOnce(state.playerBase) });
  },

  canOpenCityView: () => cityViewOpen(get().playerBase),

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

  setPilotWeaponStyle: (style) => {
    set(s => ({
      pilotWeaponStyle: style,
      ui: {
        ...s.ui,
        message: style === 'ranged'
          ? 'Piloto: priorizando armas à distância.'
          : style === 'melee'
            ? 'Piloto: priorizando corpo a corpo.'
            : 'Piloto: arma automática por distância.',
      },
    }));
  },

  recordPilotIntent: (intent) => {
    // Só grava se mudou a referência, pra não disparar re-render à toa.
    if (get().pilotLastIntent === intent) return;
    set({ pilotLastIntent: intent });
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
    const now = Date.now();
    set(s => ({
      feedback: pushEvent(s.feedback, damageEvent(targetId, Math.round(amount), position, { onPlayer }), now),
      // Dano no jogador = sinal de agressão: o piloto prioriza combate sobre farm
      // por uma janela curta (ver RECENT_DAMAGE_WINDOW_MS em objectiveSystem).
      ...(onPlayer ? { player: { ...s.player, lastDamagedAt: now } } : {}),
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
    if (getDistance(state.player.position, node.position) > harvestRangeFor(def.range, state.player.level) + 0.5) {
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
      audioManager.playHarvest(); // som de coletar (madeira/pedra/etc.)
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

    // HORDAS (Fase 5): ciclo paz↔combate; spawna a onda ao redor da base.
    let waveState = state.wave;
    let waveCreatures = ticked.creatures;
    let upgradeChoices = state.upgradeChoices;
    {
      const center = baseCenter(state.playerBase);
      const aliveWave = ticked.creatures.filter(
        (c) => c.id.startsWith('wave') && c.hp > 0 && c.behavior !== 'dead',
      ).length;
      const wt = tickWaves(state.wave, now, center != null, aliveWave, state.playerBase?.enclosed === true);
      waveState = wt.state;
      if (wt.startedWave && center) {
        const spawned = spawnWaveRaiders(wt.startedWave, center, now);
        waveCreatures = [...ticked.creatures, ...spawned];
        waveState = markSpawned(waveState, spawned.length);
      }
      // Onda repelida → oferece 3 cartas de evolução da base (draft do Pedro).
      if (wt.repelledWave && !upgradeChoices) {
        upgradeChoices = rollUpgradeChoices(Math.random);
      }
      if (wt.message) messages.push(wt.message);
    }

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
      && waveCreatures === state.creatures
      && waveState === state.wave
      && upgradeChoices === state.upgradeChoices
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
      creatures: waveCreatures,
      wave: waveState,
      upgradeChoices,
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
      healSlot: findHealHotbarIndex(state.player.inventory) ?? (findBestHealItem(state.player.inventory, DEV_INFINITE_POTIONS) ? 0 : null),
      gatherCapacity: getWeight(state.player.inventory) < state.player.inventory.maxWeight && state.player.inventory.slots.some(slot => {
        if (slot.itemId === null) return true;
        const item = ITEMS[slot.itemId];
        return Boolean(item && slot.quantity < item.maxStack);
      }),
      autoPotion: state.autoPotion,
      autoHuntRadius: state.autoHuntRadius,
      pilotWeaponStyle: state.pilotWeaponStyle,
      ...(state.player.lastDamagedAt != null ? { playerLastDamagedAt: state.player.lastDamagedAt } : {}),
      ...(state.pilotLastIntent != null ? { previousIntent: state.pilotLastIntent } : {}),
      playerLevel: state.player.level,
      ...(() => {
        const inv = state.player.inventory;
        const level = state.player.level;
        const ammoCount = getItemCount(inv, 'ammo');

        // Toda a hotbar vira candidata a arma do piloto: melee (espada/machado/
        // picareta/tocha) + ranged (arco/pistola/rifle). Poção/comida/recurso ficam
        // de fora. A munição decide o ranged: bala acabou → arco (flecha livre) entra.
        const weapons: AutoWeapon[] = [];
        inv.hotbar.slots.forEach((invIndex, hotbarIndex) => {
          if (invIndex == null) return;
          const slot = inv.slots[invIndex];
          if (!slot?.itemId || slot.quantity <= 0) return;
          const item = ITEMS[slot.itemId];
          if (!item) return;
          const prof = weaponFor(slot.itemId);
          // Arma do piloto = item EMPUNHÁVEL (`equippable`) que dê dano de arma:
          // ranged conhecida OU attackPower > 0. A tocha e o `ancestral_strike`
          // ficam de fora: não são empunháveis como arma (equippable:false), logo
          // `useHotbarSlot` neles não troca `equipment.primary` e o dano não sai.
          // Armadura é equippable mas sem attackPower/ranged → também fica de fora.
          const isWeapon = item.equippable === true && (prof.ranged || (item.attackPower ?? 0) > 0);
          if (!isWeapon) return;
          // Melee = sempre usável; ranged de BALA precisa de munição; flecha é livre.
          const hasAmmo = !prof.ranged || prof.projectile !== 'bullet' || ammoCount > 0;
          weapons.push({
            hotbarIndex,
            itemId: slot.itemId,
            type: prof.type,
            range: weaponRangeFor(slot.itemId, level),
            cooldown: prof.cooldown,
            attackPower: item.attackPower ?? 0,
            hasAmmo,
          });
        });

        const heldHotbarIndex = state.ui.selectedHotbar;
        const heldSlot = inv.hotbar.slots[heldHotbarIndex];
        const heldItemId = heldSlot != null ? inv.slots[heldSlot]?.itemId ?? null : null;
        // Valor de hoje: alcance da arma na MÃO (escala com o nível, igual ao combate).
        const heldRange = weaponRangeFor(heldItemId, level);

        return {
          weapons,
          heldHotbarIndex,
          heldRange,
          // Alcance EFETIVO = o da melhor arma disponível, não só a arma na mão.
          // Assim o piloto emite `attack` de longe quando há ranged com munição.
          attackRange: maxAttackRange(weapons, heldRange),
        };
      })(),
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
        // Inimigo (raider/lobo/boss) vs pacífico (cervo/coelho): o piloto defende
        // dos inimigos, mas NÃO persegue pacífico — senão nunca farma.
        hostile: !(CREATURES[c.speciesId]?.peaceful ?? false),
        // Nível derivado dos stats da espécie (fallback 1 se desconhecida).
        level: CREATURES[c.speciesId] ? creatureLevel(CREATURES[c.speciesId]!) : 1,
      })),
      camps: state.camps.map(c => ({
        id: c.id,
        position: c.position,
        radius: CAMPS[c.defId]?.radius ?? 8,
        creatureIds: c.creatureIds,
        cleared: c.cleared,
      })),
      // O piloto recebe os dois: nós de colheita novos e os recursos legados.
      // Todos os tipos de HARVEST_NODES (madeira/pedra/ferro/ouro/cristal) são
      // elegíveis; o `range` sai da definição do nó pra casar com a coleta real.
      resources: [
        ...state.harvestNodes.map(n => ({
          id: n.id,
          position: n.position,
          depleted: n.depleted,
          kind: n.kind,
          range: HARVEST_NODES[n.kind] ? harvestRangeFor(HARVEST_NODES[n.kind]!.range, state.player.level) : undefined,
        })),
        ...state.resources.map(r => ({ id: r.id, position: r.position, depleted: r.depleted })),
      ],
      objectives: state.objectives,
      homePosition: HOME_POSITION,
      safeZone: SAFE_ZONE,
      baseUnderSiege: state.wave.phase === 'combat',
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
