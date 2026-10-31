import { create } from 'zustand';
import type {
  PlayerState, CreatureState, ResourceNode, DeathBag, UIState, BaseState, BaseResult, BuildingId,
  CampState, ObjectiveQueueState, ObjectiveKind, AutoMode, AutoSnapshot, AutoIntent, Position,
  HarvestNodeState, FeedbackEvent, InventoryState,
} from '../types';
import { combineStorage, hordeStorageLoss, splitSpend } from '../systems/baseStorageSystem';
import { ITEMS } from '../data/items';
import { slotForItem, ringSlotForEquipment, type EquipmentKey } from '../systems/equipmentSlots';
import { weaponFor, weaponRangeFor } from '../data/weapons';
import { maxAttackRange, type AutoWeapon, type PilotWeaponStyle } from '../systems/weaponChoiceSystem';
import { audioManager, distanceGain } from '../audio/audio-manager';
import { noteShotAt } from '../systems/shotFacing';
import { breakGrab } from '../systems/grabSystem';
import { isInvulnerable } from '../systems/dodgeSystem';
import { creatureLayer, layers, sameLayerAsPlayer } from '../systems/layerSystem';
import { BOOST_DURATION_MS, BOOST_ITEMS, BOOST_UNLOCK_LEVEL, boostCooldown, boostScale, BURST_GAP, burstSize, shotCooldown, startBurst } from '../systems/burstSystem';
import { DEFAULT_ATTRIBUTES, type PlayerAttributes } from '../types/player';
import { CREATURES, ENEMY_RESPAWN_MULT, WILD_RESPAWN_MULT, scaleEnemyHp } from '../data/creatures';
import { CAMPS, SAFE_ZONE, WORLD_HALF } from '../data/camps';
import { HARVEST_NODES, harvestRangeFor } from '../data/harvest-nodes';
import { DEV_INFINITE_POTIONS } from '../config/dev-flags';
import { createInventory, addItem, removeItem, getWeight, getUsedSlots, canAddItem, getDroppableItems, getItemCount } from '../systems/inventorySystem';
import { resolveAttack, getDistance, calculateDamage } from '../systems/combatSystem';
import { deployTroops, stepTroops, type FieldTroop, type TroopFoe } from '../systems/troopSystem';
import { UNITS } from '../data/units';
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
import { BASE_GRID } from '../types/playerbase';
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
import { grantMobilityKit, isMobilityItem, SURFBOARD_ID } from '../systems/zonaSulKit';
import { isUnlocked, lockedMessage, unlockLevel } from '../systems/unlockSystem';
import { clampX, clampZ, isClassicWorld, WORLD, type MapId } from '../data/world-profile';
import { baseFallLevelLoss, creatureLevel, creatureXp, grantXp, playerBaseAttack, xpForLevel } from '../systems/progressionSystem';
import { damageMultiplier, playerCritStats, effectiveMaxWeight, effectiveSpecialCooldown, mitigateDamage, SKILL_STEP, SKILL_CAP_PER_ATTR } from '../systems/attributesSystem';
import { effectiveMaxHp, equipmentStats } from '../systems/equipmentStatsSystem';
import { createHarvestNodes, harvestFitsChecker, harvestNode as harvestWorldNode, tickHarvestNodes } from '../systems/harvestSystem';
import { drinkBestPotion, findBestHealItem, shouldAutoDrink } from '../systems/potionSystem';
import { createNightPigeons, createNightZombies, createWildCreatures, NIGHT_FLOCK_PREFIX, NIGHT_ZOMBIE_PREFIX, nightFlockAction } from '../systems/wildlifeSystem';
import { INITIAL_WAVE, tickWaves, waveEnemyCount, waveHpScale, markSpawned, scaleHordeAmmo, applyHordeCall, hordeCallBonus, type WaveState } from '../systems/waveSystem';
import { eliteLoot, eliteXp } from '../systems/difficultySystem';
import { UPGRADE_CARDS, rollUpgradeChoices, towerDamageMult, wallHpMult, coreHpMult, type UpgradeId } from '../data/base-upgrades';
import { boomerangPositions, orbitCount, orbitDamage, ORBIT_HIT_RADIUS, ORBIT_TICK_MS, ORBIT_PUSH, ORBIT_BASE_WAVES, ORBIT_EXTEND_WAVES, tornadoPositions, tornadoCount, tornadoDamage, TORNADO_HIT_RADIUS, TORNADO_PUSH, TORNADO_BASE_WAVES, TORNADO_EXTEND_WAVES, dist2, type Vec2 } from '../systems/powerSystem';
import { restoreWave, SAVE_KEY } from '../systems/persistenceSystem';
import {
  damageEvent, deathEvent, harvestEvent, healEvent, levelUpEvent, lootEvent, pruneEvents, pushEvent,
  pushEvents, shotEvent, xpEvent,
} from '../systems/feedbackSystem';
import type { FeedbackDraft } from '../systems/feedbackSystem';
import { broadcastCreatureHit, broadcastPlayerHit, broadcastWaveSpawn, canSimulateSharedWorld, isMyWave, useNet } from '@/net/multiplayer';
import {
  BOOMERANG_DMG_MULT, BOOMERANG_DURATION_MS, BOOMERANG_HIT_RADIUS, BOOMERANG_PUSH, HERO_POWER_LABEL,
  HERO_POWER_TICK_MS, HERO_POWER_UNLOCK, LIGHTNING_BOLT_MS, LIGHTNING_DMG_MULT, LIGHTNING_SPLASH,
  LIGHTNING_TARGETS, TORNADO_DMG_MULT, TORNADO_DURATION_MS, TORNADO_HIT_RADIUS as HERO_TORNADO_HIT_RADIUS,
  TORNADO_PUSH as HERO_TORNADO_PUSH,
  heroBoomerangPositions, heroPowerCooldown, heroPowerRadius, heroTornadoPositions, pushAway, type HeroPowerId,
} from '../systems/heroPowersSystem';
import { queueKnockback } from '../systems/knockbackSystem';

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
  /** Cooldown (s, relógio absoluto) da Chuva de Flechas — poder de longe. Não persiste. */
  lastArrowRainAt: number;
  /** BOOST FIRE (burstSystem): ativo até (ms) e último uso (s). Não persiste (igual aos poderes). */
  boostFireUntil: number;
  lastBoostFireAt: number;
  /** Poderes do herói (bumerangue/furacão/raio): cooldowns (s), janelas ativas (ms) e clarões. */
  heroPowers: HeroPowersState;
  base: BaseState;
  /** Base persistente no mundo (Fase 3). `null` = ainda não reivindicou terreno. */
  playerBase: PlayerBaseState | null;
  selectedBaseType: BaseType;
  /** Milissegundos por torre; separado das peças para não reconstruir malhas por tiro. */
  towerLastShotAt: Record<string, number>;
  /** Tropas em CAMPO na horda (não vão pro save; a contagem fica em `base.troops`). */
  fieldTroops: FieldTroop[];
  troopSeq: number;
  /** Tropas nas ondas: sai/luta/volta (ver `troopSystem`). `dt` em segundos. */
  tickTroops: (now: number, dt: number) => void;
  /** RAID: inimigo acertou uma tropa minha (chega pela rede). A morte sai no próximo `tickTroops`. */
  damageFieldTroop: (troopId: string, damage: number) => void;
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
  /** "Chamar a horda agora": bônus de loot da onda que vem (não persiste). */
  hordeCall: { wave: number; bonus: number } | null;
  /** Pula a paz e traz a próxima onda já, com bônus de loot (+10%/min pulado, teto +50%). */
  callHordeNow: () => void;
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
  /** Onde o automático foi LIGADO (volta pra cá quando acaba tudo em volta). Só sessão. */
  pilotAnchor: Position | null;
  /** Eventos efêmeros (dano, XP, loot) para o mundo 3D e o HUD. Somem pelo `ttl`. */
  feedback: FeedbackEvent[];
};

type GameActions = {
  selectBaseType: (type: BaseType) => void;
  tickTowers: (towers: readonly TowerSource[], now: number, rng?: () => number) => void;
  upgradeTower: (pieceId: string) => void;
  /** Aplica o dano dos powers orbitais (bumerangues) na horda. Throttled. */
  tickPowers: (now: number) => void;
  attack: (targetId: string, fromBurst?: boolean) => void;
  /** Tiro NO VAZIO (mira em 3ª pessoa, pontinho sem alvo — igual CS): arma de longe gasta
   *  munição/cadência, toca o som e o projétil sai rumo a `toward`. Não acerta ninguém.
   *  Retorna false se a arma na mão não é de longe (aí o chamador usa o ataque de sempre). */
  fireMiss: (toward: Position, towardY?: number, fromBurst?: boolean) => boolean;
  /** Arma de corpo a corpo: golpe no AR (animação + som, cadência da arma, sem dano). Câmera de ombro sem
   *  ninguém no alcance — antes o clique não fazia nada (Pedro 25/10). false = arma de longe/cadência. */
  swingAir: () => boolean;
  /** Torre da base atira num JOGADOR inimigo (online): gasta 1 bala do pool, marca a recarga da
   *  torre e mostra o projétil. O dano vai pela rede (quem decide é o alvo). false = sem bala. */
  towerFireAtPlayer: (tower: TowerSource, to: Position, toY: number | undefined, now: number) => boolean;
  specialAttack: (kind: 'jump' | 'spin') => void;
  /** Chuva de Flechas: poder de longe, flechas caem do céu e dão dano em ÁREA (raio escala
   *  com o nível, 5 m → 18 m; cooldown 15 s → 5 s). Precisa de arma de longe equipada.
   *  `auto` (piloto idle): silencioso — não escreve mensagem quando ainda não pode disparar. */
  arrowRain: (auto?: boolean) => void;
  /** BOOST FIRE: 4 s de cadência 2× pra pistola/rifle (tecla T). auto = piloto (silencioso, só com alvo no alcance). */
  boostFire: (auto?: boolean) => void;
  /** Poder do herói por id (mesmo esquema da Chuva: só cooldown, desbloqueio por nível). */
  castHeroPower: (id: HeroPowerId, auto?: boolean) => void;
  /** Aplica o dano/empurrão contínuo do bumerangue/furacão ativos (throttled). */
  tickHeroPowers: (nowMs: number) => void;
  collect: (nodeId: string) => void;
  collectNearest: () => void;
  /** Faz nascer o mini-boss (um por vez) perto do jogador. Chamado pelo timer. */
  spawnBoss: () => void;
  /** Bando de pombos da NOITE (wildlifeSystem): chega ao escurecer, vai embora ao clarear. `night` = nightFactor (0–1). */
  tickNightFlock: (night: number) => void;
  /** Gasta 1 ponto de skill subindo um atributo (0–100%). */
  allocateSkill: (attr: keyof PlayerAttributes) => void;
  /** Devolve 1 ponto, baixando um atributo alocado. */
  deallocateSkill: (attr: keyof PlayerAttributes) => void;
  /** Equipa um item da bolsa no slot certo pela categoria (arma/armadura/acessório). */
  equipItem: (itemId: string) => void;
  /** Tira o equipamento de um slot (volta pro "nu"). */
  unequipSlot: (slot: EquipmentKey) => void;
  useHotbarSlot: (index: number, opts?: { manual?: boolean }) => void;
  /** COLOCA o item do espaço `invIndex` da mochila na tecla `hotIndex` da hotbar (arrastar / "Pôr na hotbar"). Se ele já
   *  estava em outra tecla, sai de lá. 29/10 (Pedro: "a prancha no loot e não consigo pôr no hotkey") — soltar na
   *  hotbar chamava useHotbarSlot (SELECIONAR), não colocava nada. */
  assignHotbar: (hotIndex: number, invIndex: number) => void;
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
  /** `radius` opcional (Zona Sul: raio grande da zona). Ausente = HUNT_AREA_RADIUS de sempre. */
  addHuntArea: (x: number, z: number, radius?: number) => void;
  drinkPotion: () => void;
  /** Zona Sul: entrega a prancha (1ª entrada) — mochila + espaço livre da hotbar. */
  grantSurfboard: () => void;
  /** Kit de mobilidade (prancha, asa-delta, skate voador): entrega o que faltar. `grantSurfboard` = o mesmo (nome antigo). */
  grantMobilityKit: () => void;
  /** TROCA DE MAPA (o perfil já foi trocado em world-profile): bichos, acampamentos, recursos e posição do mapa novo.
   *  Zona Sul: a fauna vem pronta (precisa do terreno) e a posição é a do herói de lá. */
  enterWorld: (map: MapId, zs?: { creatures: CreatureState[]; position: Position; harvestNodes?: HarvestNodeState[]; resources?: ResourceNode[] }) => void;
  tickWorld: () => void;
  /** O mundo 3D chama quando uma criatura acerta o jogador (ou outro dano que só ele vê). */
  reportDamage: (targetId: string, amount: number, position: Position, onPlayer: boolean) => void;
  /** Aplica dano ao jogador LOCAL (usado pelo PvP: golpe de um inimigo remoto). Reduz HP,
   *  mata em 0 (respawn) e marca agressão. `sourceName` = quem bateu (pra mensagem). */
  /** `pvp` = veio de outro jogador (ou torre dele) → a tela de morte mostra quem te matou. */
  takePlayerDamage: (amount: number, sourceName: string, pvp?: boolean) => void;
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

/**
 * Caixa único das construções da BASE (armazém compartilhado — `baseStorageSystem`): roda a
 * cobrança de sempre numa bolsa virtual (bolsa + armazém) e devolve a bolsa e o armazém já
 * descontados (armazém primeiro). `base` = cidade já com a produção até agora.
 */
/** Cidade avançada até `now`: só PRODUZ com base no chão (Pedro, 24/10 — sem base, armazém parado). */
export function tickCity(s: { base: BaseState; playerBase: PlayerBaseState | null }, now: number): BaseState {
  return resolveBase(s.base, now, s.playerBase !== null);
}

function payWithBaseStorage<T extends { inventory: InventoryState }>(
  s: { base: BaseState; player: PlayerState; playerBase: PlayerBaseState | null },
  run: (combined: InventoryState, base: BaseState) => T,
): { result: T; inventory: InventoryState; resources: BaseState['resources']; base: BaseState } {
  const base = tickCity(s, Date.now());
  const combined = combineStorage(s.player.inventory, base.resources);
  const result = run(combined, base);
  const paid = splitSpend(s.player.inventory, base.resources, combined, result.inventory);
  return { result, inventory: paid.inventory, resources: paid.resources, base };
}

/** Sacos de loot no chão: NENHUMA tela os mostra ainda (auditoria 23/10) → com bolsa cheia a lista
 *  crescia 1 saco por bicho, sem fim. Limite: 30 mais recentes, no máximo 15 min. */
const BAG_CAP = 30;
const BAG_TTL_MS = 15 * 60 * 1000;
export function pushBag(bags: DeathBag[], bag: DeathBag): DeathBag[] {
  const now = Date.now();
  return [...bags.filter(b => now - b.createdAt < BAG_TTL_MS), bag].slice(-BAG_CAP);
}

/** Alvo-jogador das tropas (raid): id com prefixo; golpes somados e enviados no máx. 2×/s. */
const PLAYER_FOE = 'player:';
const troopPlayerDamage = new Map<string, number>();
let troopPlayerFlushAt = 0;

/** Início da onda em curso (ms) — p/ o resumo "durou X" da onda repelida. Não persiste. */
let waveStartedMs = 0;

/** Caminho comum de morte para armas, especiais e defesa da base. HORDA nunca renasce (Pedro 25/10: a base caiu
 *  na PAZ da onda 9 — os mortos da horda renasciam 2,4–4 min depois, no anel em volta da base, e marchavam até o
 *  núcleo pelo perímetro furado). */
/** Som do disparo da torre pela distância até o jogador (Pedro 25/10: torres atiravam mudas). */
function towerSfx(tower: { x: number; z: number }, me: { x: number; z: number }): void {
  audioManager.playWorld('tower', distanceGain(Math.hypot(tower.x - me.x, tower.z - me.z)));
}

export function deadCreature(c: CreatureState, now: number, rng: () => number): CreatureState {
  const respawnAt = c.speciesId === 'raider_warlord' || c.id.startsWith('wave')
    ? null
    : now + Math.round((180_000 + rng() * 120_000) * (c.id.startsWith('wild_') ? WILD_RESPAWN_MULT : ENEMY_RESPAWN_MULT));
  return { ...c, hp: 0, behavior: 'dead', respawnAt };
}

/** Loot/XP seguem o mesmo caminho dos especiais, inclusive bônus de caça. */
function rewardCreatureDeath(c: CreatureState, player: PlayerState, bags: DeathBag[], drafts: FeedbackDraft[], rng: () => number) {
  const def = CREATURES[c.speciesId];
  if (def) {
    const luck = equipmentStats(player).luck;
    const loot = applyHordeCall(eliteLoot(scaleHordeAmmo(rollCreatureLoot(def, rng, luck), c.id), c), c.id, useGameStore.getState().hordeCall); // Enfurecido ×2; horda chamada +bônus
    const newHunt = (player.huntValue ?? 0) + creatureXp(def);
    const seen = player.huntSeen?.[c.speciesId] ?? 0;
    const bonus = rollBonusLoot(def, newHunt, seen, rng, luck);
    player = { ...player, huntValue: newHunt, huntSeen: { ...(player.huntSeen ?? {}), [c.speciesId]: seen + 1 } };
    if (bonus) loot.push(bonus);
    // Loot vai DIRETO pro inventário, empilhando nos slots (madeira/pedra/bala/poção
    // acumulam; abre slot novo só quando enche). Sem saco, sem diálogo (Pedro). O que
    // NÃO couber (inventário/peso cheio) cai num saco no chão — nada se perde.
    let inv = player.inventory;
    const overflow: typeof loot = [];
    for (const drop of loot) {
      if (!drop.itemId) continue;
      // "+item" só pro que ENTROU na bolsa (antes mostrava até o que não cabia).
      if (canAddItem(inv, drop.itemId, drop.quantity)) { inv = addItem(inv, drop.itemId, drop.quantity); drafts.push(lootEvent(drop.itemId, drop.quantity, c.position)); }
      else overflow.push(drop);
    }
    player = { ...player, inventory: inv };
    if (overflow.length) bags = pushBag(bags, createDeathBag(c.id, c.name, c.position, overflow));
  }
  const xpGain = eliteXp(creatureXp(def ?? c), c); // Enfurecido: +50% (XP NÃO segue a vida extra)
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
    { itemId: 'health_potion', quantity: 500 },
    { itemId: 'trap', quantity: 3 },
    { itemId: 'cooked_meat', quantity: 8 },
    { itemId: 'torch', quantity: 1 },
    { itemId: 'ancestral_strike', quantity: 1 },
    { itemId: 'wood', quantity: 12 },
    { itemId: 'stone', quantity: 8 },
    { itemId: 'bow', quantity: 1 },
    { itemId: 'pistol', quantity: 1 },
    { itemId: 'rifle', quantity: 1 },
    { itemId: 'ammo', quantity: 2000 }, // munição inicial (Pedro: 2k; farm/bicho dropa ~50 e repõe)
    { itemId: 'arrow', quantity: 2000 }, // flecha inicial (Pedro: 2k, igual à bala; arco gasta flecha)
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

/** Criaturas fixas do início. Eram 3 RAPOSAS perto do nascedouro — Pedro 26/10: raposa fora do jogo (a definição
 * fica: testes e saves antigos). O drop dela (couro/presa/tendão + 2 peças de armadura) foi pra leoa/búfalo/jacaré. */
function createInitialCreatures(): CreatureState[] {
  return [];
}

// 26/10 (Pedro: "tirar o robô"): na vaga do Mecha Pelter entra a FAUCE DE SÍLEX. O robô era o "ralo de bala" da
// horda (130 de vida, NÃO solta bala); medido na conta da bala (bala-horda.test): sem ninguém na vaga sobrava bala até
// a onda 21+; Fauce (95 de vida, sem bala) zera entre a 19 e a 20 (robô: ~18) → regra "dura até 18–20" mantida.
const WAVE_SPECIES = ['raider_scout', 'raider_warrior', 'raider_puglin', 'raider_brute', 'raider_shaman', 'flintmaw'] as const;

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

/** Convidado pedindo a própria horda ao host: reenvia a cada 4 s; desiste em 60 s (não trava). */
const GUEST_WAVE_RETRY_MS = 4000;
const GUEST_WAVE_GIVE_UP_MS = 60_000;
let guestWaveAskedAt = 0;
let guestWaveFirstAskAt = 0;

/** Cria os raiders de uma onda ao redor da base (eles marcham até ela — ver hostile-ai).
 *  `owner` (online): id do dono da base no id do bicho (`wave3_oABC_...`) — cada jogador tem
 *  a própria horda no mesmo mundo. Vazio = solo (formato antigo). */
export function spawnWaveRaiders(wave: number, center: { x: number; z: number }, now: number, owner = ''): CreatureState[] {
  const ownerTag = owner ? `o${owner}_` : '';
  const hpScale = waveHpScale(wave);
  const classic = isClassicWorld();
  const clamp = (v: number) => Math.max(-WORLD_HALF + 2, Math.min(WORLD_HALF - 2, v));
  const out: CreatureState[] = [];
  const mk = (sp: string, i: number, tag: string, hpMul = 1) => {
    const def = CREATURES[sp];
    if (!def) return;
    const total = waveEnemyCount(wave) + waveBossCount(wave);
    let ang = (i / Math.max(1, total)) * Math.PI * 2 + Math.random() * 0.5;
    let r = 34 + Math.random() * 14; // nascem BEM fora da vista, marcham até a base
    // fora do Vale (Zona Sul, 31/10): dentro do mapa ativo e em CHÃO FIRME (não nasce no mar/Lagoa) — gira o anel até achar
    if (!classic && WORLD.walkable) {
      for (let k = 0; k < 24; k++) {
        const x = clampX(center.x + Math.sin(ang) * r, 4), z = clampZ(center.z + Math.cos(ang) * r, 4);
        if (WORLD.walkable(x, z)) break;
        ang += 0.55; if (k % 8 === 7) r = Math.max(18, r - 8);
      }
    }
    const hp = Math.round(scaleEnemyHp(def.maxHp) * hpScale * hpMul);
    out.push({
      id: `wave${wave}_${ownerTag}${tag}${i}_${now}`,
      speciesId: sp,
      name: def.name,
      hp, maxHp: hp,
      attackPower: def.attackPower,
      armor: def.armor,
      attackCooldown: def.attackCooldown,
      lastAttackAt: 0,
      position: classic ? { x: clamp(center.x + Math.sin(ang) * r), z: clamp(center.z + Math.cos(ang) * r) } : { x: clampX(center.x + Math.sin(ang) * r, 4), z: clampZ(center.z + Math.cos(ang) * r, 4) },
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

/** Fator de escala por nível (0 no nv1 → 1 no nv200+). Usado pela Chuva de Flechas. */
function arrowRainT(level: number): number {
  return Math.min(1, Math.max(0, (level - 1) / 199));
}
/** Raio da área da Chuva de Flechas: 5 m (nv1) → 18 m (nv200+). */
export function arrowRainRadiusFor(level: number): number {
  return Math.round((5 + (18 - 5) * arrowRainT(level)) * 10) / 10;
}
/** Cooldown da Chuva de Flechas: 15 s (nv1) → 5 s (nv200+). */
export function arrowRainCooldownFor(level: number): number {
  return Math.round((15 - (15 - 5) * arrowRainT(level)) * 10) / 10;
}
/** Nº de ondas da Chuva de Flechas e o intervalo entre elas (Pedro: 3 chuvas, 1 s). */
export const ARROW_RAIN_WAVES = 3;
export const ARROW_RAIN_WAVE_MS = 1000;
/** Nível que DESBLOQUEIA a Chuva de Flechas (1º poder do herói). */
export const ARROW_RAIN_UNLOCK_LEVEL = 5;

/* ---------------- PODERES DO HERÓI (bumerangue nv10 · furacão nv15 · raio nv20) ---------------- */
/** Intervalo COMUM entre poderes do herói (Chuva, Bumerangue, Furacão, Raio): um de cada vez. */
export const POWER_GAP_S = 5;
/** Segundos que faltam pra liberar o próximo poder (0 = livre). Tempos em segundos. */
function powerGapLeft(st: { lastArrowRainAt: number; heroPowers: HeroPowersState }, nowS: number): number {
  const last = Math.max(st.lastArrowRainAt, ...Object.values(st.heroPowers.lastAt));
  return Math.max(0, POWER_GAP_S - (nowS - last));
}

export type HeroPowersState = {
  /** Último uso (s, relógio absoluto) — cooldown. Não persiste (igual à Chuva). */
  lastAt: Record<HeroPowerId, number>;
  boomerangStart: number; // ms
  boomerangUntil: number; // ms
  tornadoStart: number;   // ms
  tornadoUntil: number;   // ms
  /** De onde os 2 tornados saíram e pra onde vão (direção ao hostil mais perto). */
  tornadoOrigin: { x: number; z: number };
  tornadoDir: { x: number; z: number };
  lastTickAt: number;     // ms
  /** Clarões do raio (visual). */
  bolts: { x: number; z: number; at: number }[];
};
export const INITIAL_HERO_POWERS: HeroPowersState = {
  lastAt: { boomerang: 0, tornado: 0, lightning: 0 },
  boomerangStart: 0, boomerangUntil: 0, tornadoStart: 0, tornadoUntil: 0,
  tornadoOrigin: { x: 0, z: 0 }, tornadoDir: { x: 0, z: 1 }, lastTickAt: 0, bolts: [],
};

/** Hostil pra poder: vivo e não pacífico (igual aos poderes da base). */
function isPowerTarget(c: CreatureState): boolean {
  return c.behavior !== 'dead' && c.hp > 0 && !CREATURES[c.speciesId]?.peaceful && sameLayerAsPlayer(c.id);
}

/** Força base do herói pros poderes (mesma conta da Chuva de Flechas). */
function heroPowerBase(st: GameState): number {
  const selSlot = st.player.inventory.hotbar.slots[st.ui.selectedHotbar];
  const heldId = selSlot != null ? st.player.inventory.slots[selSlot]?.itemId ?? null : null;
  return (playerBaseAttack(st.player.level) + (heldId ? (ITEMS[heldId]?.attackPower ?? 0) : 0)) * damageMultiplier(st.player);
}

/**
 * Golpe de PODER em várias criaturas: dano (armadura + crítico), recompensa/drop, feedback e
 * EMPURRÃO (fila do AI). Convidado em sala → manda a intenção pro host (cena única) e não
 * mexe local (o host aplica e devolve no snapshot).
 */
function heroStrike(st: GameState, hits: Map<string, { power: number; push: Vec2 | null }>): Partial<GameState> | null {
  if (hits.size === 0) return null;
  if (!canSimulateSharedWorld()) {
    for (const c of st.creatures) {
      const h = hits.get(c.id);
      if (h) broadcastCreatureHit({ targetId: c.id, source: c.position, damage: Math.round(h.power) });
    }
    return null;
  }
  let player = st.player;
  let bags = st.deathBags;
  const drafts: FeedbackDraft[] = [];
  const crit = playerCritStats(st.player);
  const creatures = st.creatures.map((c) => {
    const h = hits.get(c.id);
    if (!h || !isPowerTarget(c)) return c;
    const r = resolveAttack(Math.max(1, Math.round(h.power)), c.hp, c.maxHp, c.armor, c.name, crit);
    drafts.push(damageEvent(c.id, r.damage, c.position, { critical: !!r.critical }));
    if (r.targetDied) {
      const reward = rewardCreatureDeath(c, player, bags, drafts, Math.random);
      player = reward.player;
      bags = reward.bags;
      return deadCreature(c, Date.now(), Math.random);
    }
    if (h.push) queueKnockback(c.id, h.push.x, h.push.z);
    return { ...c, hp: r.targetHp, behavior: 'chase' as const };
  });
  return { player, creatures, deathBags: bags, feedback: pushEvents(st.feedback, drafts, Date.now()) };
}

export const useGameStore = create<GameState & GameActions>((set, get) => ({
  player: createInitialPlayer(),
  creatures: [...createInitialCreatures(), ...createWildCreatures(), ...INITIAL_CAMP_WORLD.creatures],
  resources: createInitialResources(),
  deathBags: [],
  attackTick: 0,
  specialTick: 0,
  specialKind: null,
  lastArrowRainAt: 0,
  boostFireUntil: 0,
  lastBoostFireAt: 0,
  heroPowers: INITIAL_HERO_POWERS,
  base: createInitialBase(Date.now()),
  playerBase: null,
  selectedBaseType: DEFAULT_BASE_TYPE,
  towerLastShotAt: {},
  fieldTroops: [],
  troopSeq: 0,
  powerLastTickAt: 0,
  wave: INITIAL_WAVE,
  baseLevel: 1,
  baseEvolved: false,
  baseMetal: false,
  stats: { basesEvolved: 0, basesLost: 0, survivalStart: Date.now() },
  baseUpgrades: { tower_damage: 0, wall_hp: 0, base_repair: 0, core_hp: 0, orbit_boomerang: 0, tornado: 0 },
  upgradeChoices: null,
  hordeCall: null,
  orbitExpiresWave: 0,
  tornadoExpiresWave: 0,
  camps: INITIAL_CAMP_WORLD.camps,
  objectives: createQueue(),
  targetId: null,
  harvestNodes: createHarvestNodes(),
  autoPotion: true,
  autoHuntRadius: 45,
  pilotWeaponStyle: 'auto',
  pilotLastIntent: null,
  pilotAnchor: null,
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
    const pb = state.playerBase;
    const pay = payWithBaseStorage(state, (inv) => upgradePlayerTower(pb, pieceId, inv));
    const result = pay.result;
    set({ playerBase: result.base,
      ...(result.ok ? { player: { ...state.player, inventory: pay.inventory }, base: { ...pay.base, resources: pay.resources } } : {}),
      ui: { ...state.ui, message: result.message } });
  },

  tickTowers: (towers, now, rng = Math.random) => {
    // Nenhuma escrita/alocação nos quadros sem disparo. Cada torre lê o resultado
    // da anterior, portanto duas torres não premiam a mesma morte.
    for (const tower of towers) {
      const state = get();
      const index = selectTowerTarget(tower, state.creatures, state.towerLastShotAt[tower.id], now);
      if (index < 0) continue;
      // POOL COMPARTILHADO de bala (Pedro): a torre gasta a MESMA munição do personagem.
      // Sem bala, a torre NÃO atira (base não dispara infinito) — mas as mortes dela dropam
      // loot (inclui bala) direto no inventário, então a base se reabastece farmando.
      if (getItemCount(state.player.inventory, 'ammo') <= 0) continue;
      const c = state.creatures[index]!;
      // Dano base da torre (Caio) × multiplicador das cartas de evolução (hordas).
      const damage = towerDamage(tower, c, rng) * towerDamageMult(state.baseUpgrades.tower_damage);
      const hp = Math.max(0, c.hp - damage);
      const drafts = [shotEvent(tower, c.position, 'arrow', towerHeight(tower.tier, tower.level)), damageEvent(c.id, damage, c.position)];
      if (!canSimulateSharedWorld()) {
        // Convidado: o bicho vive no host — a torre pede o dano (armadura já entrou no towerDamage,
        // então devolve a do bicho pro host não descontar 2×). A vida volta no snapshot.
        broadcastCreatureHit({ targetId: c.id, source: { x: tower.x, z: tower.z }, damage: Math.round(damage + c.armor) });
        towerSfx(tower, state.player.position);
        set({
          player: { ...state.player, inventory: removeItem(state.player.inventory, 'ammo', 1) },
          towerLastShotAt: { ...state.towerLastShotAt, [tower.id]: now },
          feedback: pushEvents(state.feedback, drafts, now),
        });
        continue;
      }
      towerSfx(tower, state.player.position);
      let player = { ...state.player, inventory: removeItem(state.player.inventory, 'ammo', 1) };
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

  tickTroops: (now, dt) => {
    const st = get();
    const pb = st.playerBase;
    // Sem base (caiu/nunca teve): ninguém em campo. Com base, as tropas FICAM nos postos fora da cerca
    // (inclusive entre ondas) até morrer — não somem/reaparecem a cada onda (Pedro, 23/10).
    if (!pb || !pb.pieces.some((p) => p.kind === 'core')) {
      if (st.fieldTroops.length) set({ fieldTroops: [] });
      return;
    }
    const half = (pb.size * BASE_GRID) / 2;
    const center = { x: pb.origin.gx * BASE_GRID + half, z: pb.origin.gz * BASE_GRID + half };
    const warCamp = st.base.buildings.find((b) => b.defId === 'war_camp')?.level ?? 1;
    const dep = deployTroops(st.base.troops, st.fieldTroops, center, warCamp, st.troopSeq, half);
    if (dep.field.length === 0) return;
    const foes: TroopFoe[] = st.creatures
      .filter((c) => c.behavior !== 'dead' && c.hp > 0 && CREATURES[c.speciesId]?.peaceful === false && creatureLayer(c.id) === 0) // base: só a superfície
      .map((c) => ({ id: c.id, position: c.position, hp: c.hp, attackPower: c.attackPower, attackCooldown: c.attackCooldown }));
    // RAID (online): jogador INIMIGO na área da base vira alvo PRIORITÁRIO. Ele não bate por contato
    // (o golpe dele chega pela rede: `troop-hit`).
    const net = useNet.getState();
    if (net.connected) {
      for (const p of Object.values(net.players)) {
        if (p.hp <= 0 || !(p.side === 'enemy' || net.selfSide === 'enemy')) continue;
        if (WORLD.under && Number.isFinite(p.y) && WORLD.under.layer(p.x, p.y as number, p.z) !== 0) continue; // na caverna embaixo: a tropa não alcança
        foes.push({ id: `${PLAYER_FOE}${p.id}`, position: { x: p.x, z: p.z }, hp: p.hp, attackPower: 0, attackCooldown: 1, priority: true });
      }
    }
    const r = stepTroops(dep.field, foes, center, warCamp, dt, now);
    // Golpes em JOGADOR: somados e enviados no máx. 2×/s por alvo (sem uma mensagem por tropa — lag).
    for (const h of r.hits) {
      if (!h.creatureId.startsWith(PLAYER_FOE)) continue;
      const pid = h.creatureId.slice(PLAYER_FOE.length);
      troopPlayerDamage.set(pid, (troopPlayerDamage.get(pid) ?? 0) + h.damage);
    }
    if (troopPlayerDamage.size && now - troopPlayerFlushAt >= 500) {
      troopPlayerFlushAt = now;
      for (const [pid, dmg] of troopPlayerDamage) broadcastPlayerHit(pid, dmg, `Tropas de ${net.selfName}`);
      troopPlayerDamage.clear();
    }
    r.hits = r.hits.filter((h) => !h.creatureId.startsWith(PLAYER_FOE));
    // Golpe da tropa = mesmo caminho da TORRE (armadura, loot/XP pro jogador, convidado pede ao host).
    let creatures = st.creatures;
    let player = st.player;
    let deathBags = st.deathBags;
    const drafts: FeedbackDraft[] = [];
    if (r.hits.length) {
      if (!canSimulateSharedWorld()) {
        for (const h of r.hits) broadcastCreatureHit({ targetId: h.creatureId, source: center, damage: h.damage });
      } else {
        creatures = creatures.slice();
        for (const h of r.hits) {
          const i = creatures.findIndex((c) => c.id === h.creatureId);
          const c = creatures[i];
          if (!c || c.hp <= 0 || c.behavior === 'dead') continue;
          const dmg = calculateDamage(h.damage, c.armor, Math.random);
          const hp = Math.max(0, c.hp - dmg);
          drafts.push(damageEvent(c.id, dmg, c.position));
          if (hp === 0) {
            const reward = rewardCreatureDeath(c, player, deathBags, drafts, Math.random);
            player = reward.player;
            deathBags = reward.bags;
            creatures[i] = deadCreature(c, now, Math.random);
          } else {
            creatures[i] = { ...c, hp, behavior: 'chase' };
          }
        }
      }
    }
    // Tropa que caiu SAI da contagem (treina outra no Campo de Guerra).
    let base = st.base;
    let message: string | null = null;
    if (r.dead.length) {
      const troops = { ...base.troops };
      for (const d of r.dead) troops[d.unitId] = Math.max(0, (troops[d.unitId] ?? 0) - 1);
      base = { ...base, troops };
      const names = r.dead.map((d) => UNITS[d.unitId]?.name ?? d.unitId);
      message = `⚔️ ${names.join(', ')} caiu defendendo a base.`;
    }
    set({
      fieldTroops: r.field,
      troopSeq: dep.seq,
      ...(creatures !== st.creatures ? { creatures, player, deathBags } : {}),
      ...(base !== st.base ? { base } : {}),
      ...(drafts.length ? { feedback: pushEvents(st.feedback, drafts, now) } : {}),
      ...(message ? { ui: { ...st.ui, message } } : {}),
    });
  },

  damageFieldTroop: (troopId, damage) => {
    const st = get();
    if (!st.fieldTroops.some((t) => t.id === troopId) || !(damage > 0)) return;
    set({ fieldTroops: st.fieldTroops.map((t) => (t.id === troopId ? { ...t, hp: Math.max(0, t.hp - Math.round(damage)) } : t)) });
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
      if (creatureLayer(c.id) !== 0) continue; // nem o que está na caverna embaixo da base
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
        queueKnockback(c.id, (dx / len) * push, (dz / len) * push); // o AI aplica de verdade (suave)
      }
      changed = true;
    }
    if (!changed) { set({ powerLastTickAt: now }); return; }
    set({
      creatures: next, player, deathBags, powerLastTickAt: now,
      feedback: pushEvents(state.feedback, drafts, now),
    });
  },

  fireMiss: (toward: Position, towardY?: number, fromBurst = false) => {
    const state = get();
    if (state.player.dead) return false;
    const selSlot = state.player.inventory.hotbar.slots[state.ui.selectedHotbar];
    const heldItemId = selSlot != null ? state.player.inventory.slots[selSlot]?.itemId ?? null : null;
    const prof = weaponFor(heldItemId);
    if (!prof.ranged || !prof.projectile) return false;
    if (!isUnlocked(heldItemId, state.player.level)) { set(s => ({ ui: { ...s.ui, message: lockedMessage(ITEMS[heldItemId!]?.name ?? 'Arma', heldItemId!) } })); return true; }
    const now = Date.now() / 1000;
    const burstN = burstSize(heldItemId, state.player.level);
    if (fromBurst && burstN <= 1) return false; // trocou de arma no meio da rajada
    const boostK = boostScale(heldItemId, Date.now(), state.boostFireUntil);
    if (now - state.player.lastAttackAt < shotCooldown(prof.cooldown, heldItemId, state.player.level, fromBurst, boostK)) return true; // cadência: clique engolido
    const ammoItem = prof.projectile === 'bullet' ? 'ammo' : 'arrow';
    if (getItemCount(state.player.inventory, ammoItem) <= 0) {
      set(s => ({ ui: { ...s.ui, message: ammoItem === 'ammo' ? 'Sem munição!' : 'Sem flechas!' } }));
      return fromBurst ? false : true;
    }
    noteShotAt(toward.x, toward.z); // o herói vira pra onde o tiro foi
    // Tiro no vazio com rifle também sai em rajada (mesmo ponto).
    if (!fromBurst && burstN > 1) {
      startBurst(burstN, () => { const b = get().player.lastAttackAt; get().fireMiss(toward, towardY, true); return get().player.lastAttackAt !== b; }, Date.now(), BURST_GAP * boostK);
    }
    if (heldItemId === 'bow') audioManager.playShot(); else audioManager.playGunShot();
    set({
      player: { ...state.player, lastAttackAt: now, inventory: removeItem(state.player.inventory, ammoItem, 1) },
      attackTick: state.attackTick + 1,
      feedback: pushEvent(state.feedback, shotEvent(state.player.position, toward, prof.projectile, undefined, towardY), Date.now()),
    });
    return true;
  },

  swingAir: () => {
    const state = get();
    if (state.player.dead) return false;
    const selSlot = state.player.inventory.hotbar.slots[state.ui.selectedHotbar];
    const heldItemId = selSlot != null ? state.player.inventory.slots[selSlot]?.itemId ?? null : null;
    const prof = weaponFor(heldItemId);
    if (prof.ranged) return false;
    const now = Date.now() / 1000;
    if (now - state.player.lastAttackAt < prof.cooldown) return false;
    audioManager.playMelee();
    set({ player: { ...state.player, lastAttackAt: now }, attackTick: state.attackTick + 1 });
    return true;
  },

  towerFireAtPlayer: (tower, to, toY, now) => {
    const state = get();
    if (getItemCount(state.player.inventory, 'ammo') <= 0) return false;
    towerSfx(tower, state.player.position);
    set({
      player: { ...state.player, inventory: removeItem(state.player.inventory, 'ammo', 1) },
      towerLastShotAt: { ...state.towerLastShotAt, [tower.id]: now },
      feedback: pushEvent(state.feedback, shotEvent(tower, to, 'arrow', towerHeight(tower.tier, tower.level), toY), now),
    });
    return true;
  },

  attack: (targetId: string, fromBurst = false) => {
    const state = get();
    const creature = state.creatures.find(c => c.id === targetId);
    if (!creature || creature.behavior === 'dead') return;
    if (!sameLayerAsPlayer(targetId)) return; // caverna: nada através da rocha (layerSystem)

    // Arma ativa = item na mão (hotbar). O perfil define alcance, cadência e tipo
    // (melee vs ranged). Tocha = dano de fogo. CombatController único: humano e
    // piloto chamam este mesmo `attack`.
    const selSlot = state.player.inventory.hotbar.slots[state.ui.selectedHotbar];
    const heldItemId = selSlot != null ? state.player.inventory.slots[selSlot]?.itemId ?? null : null;
    // Arma travada por nível na mão (ex.: save antigo com o fuzil selecionado): não atira — avisa o nível.
    if (!isUnlocked(heldItemId, state.player.level)) {
      if (!fromBurst) set(s => ({ ui: { ...s.ui, message: lockedMessage(ITEMS[heldItemId!]?.name ?? 'Arma', heldItemId!) } }));
      return;
    }
    const prof = weaponFor(heldItemId);
    const usingRanged = prof.ranged;
    const usingTorch = heldItemId === 'torch';

    const now = Date.now() / 1000;
    // RAJADA do rifle (burstSystem): tiro da rajada usa o intervalo curto; gatilho novo espera a pausa.
    const burstN = burstSize(heldItemId, state.player.level);
    if (fromBurst && burstN <= 1) return; // trocou de arma no meio da rajada
    const boostK = boostScale(heldItemId, Date.now(), state.boostFireUntil);
    if (now - state.player.lastAttackAt < shotCooldown(prof.cooldown, heldItemId, state.player.level, fromBurst, boostK)) return;

    const dist = getDistance(state.player.position, creature.position);
    const reach = weaponRangeFor(heldItemId, state.player.level);
    if (dist > reach) {
      // Pedro 26/10 ("só consigo atirar perto"): arma de longe + alvo além do alcance → o tiro SAI na direção dele e
      // cai no limite do alcance (gasta bala, sem dano). Antes não acontecia nada. Corpo a corpo: aviso, como antes.
      if (prof.ranged && prof.projectile && !fromBurst) {
        const p = state.player.position;
        const k = reach / Math.max(dist, 1e-6);
        if (get().fireMiss({ x: p.x + (creature.position.x - p.x) * k, z: p.z + (creature.position.z - p.z) * k })) {
          set(s => ({ ui: { ...s.ui, message: `${creature.name} está longe — o tiro não alcança (${Math.round(reach)} m).` } }));
        }
        return;
      }
      set(s => ({ ui: { ...s.ui, message: `${creature.name} está longe demais.` } }));
      return;
    }

    // Munição por tipo de arma (Pedro): pistola/rifle gastam BALA ('ammo'), arco gasta
    // FLECHA ('arrow'); 1 por tiro. Sem o recurso, não atira. Drop de bicho repõe a caixa.
    const ammoItem = prof.ranged ? (prof.projectile === 'bullet' ? 'ammo' : 'arrow') : null;
    if (ammoItem && getItemCount(state.player.inventory, ammoItem) <= 0) {
      const msg = ammoItem === 'ammo'
        ? 'Sem munição! Pegue balas dos saqueadores ou limpe um acampamento.'
        : 'Sem flechas! Mate bichos ou farme pra repor a aljava.';
      set(s => ({ ui: { ...s.ui, message: msg } }));
      return;
    }
    noteShotAt(creature.position.x, creature.position.z); // o herói vira pro bicho que LEVOU o golpe
    // Acertou o jacaré que te agarrou → SOLTA do giro da morte (grabSystem).
    if (breakGrab(targetId)) set(s => ({ ui: { ...s.ui, message: '💪 Você se soltou do jacaré!' } }));
    // Daqui o tiro SAI: gatilho do rifle abre a rajada (os próximos tiros repetem este mesmo ataque).
    if (!fromBurst && burstN > 1) {
      startBurst(burstN, () => { const b = get().player.lastAttackAt; get().attack(targetId, true); return get().player.lastAttackAt !== b; }, Date.now(), BURST_GAP * boostK);
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
    const finalPower = Math.round((totalPower + equipmentStats(state.player).damage) * damageMultiplier(state.player));

    // Em sala convidada o inimigo pertence ao anfitrião. O convidado conserva
    // apenas o próprio cooldown/munição e envia a intenção do golpe; a vida
    // comum volta no snapshot do anfitrião para todos os jogadores.
    if (!canSimulateSharedWorld()) {
      broadcastCreatureHit({ targetId, source: state.player.position, damage: finalPower });
      // O tiro/golpe aparece e soa NA HORA pra quem atira (antes o convidado não via nada
      // sair — parecia que não atirava); a vida do bicho volta no snapshot do host.
      if (heldItemId === 'bow') audioManager.playShot();
      else if (heldItemId === 'pistol' || heldItemId === 'rifle') audioManager.playGunShot();
      else if (!usingRanged) audioManager.playMelee();
      set({
        player: {
          ...state.player,
          lastAttackAt: now,
          inventory: ammoItem ? removeItem(state.player.inventory, ammoItem, 1) : state.player.inventory,
        },
        attackTick: state.attackTick + 1,
        feedback: usingRanged && prof.projectile
          ? pushEvent(state.feedback, shotEvent(state.player.position, creature.position, prof.projectile), Date.now())
          : state.feedback,
        ui: { ...state.ui, message: `Atacando ${creature.name}.` },
      });
      return;
    }

    const result = resolveAttack(finalPower, creature.hp, creature.maxHp, creature.armor, creature.name, playerCritStats(state.player));

    let updatedCreatures = state.creatures.map(c => {
      if (c.id !== targetId) return c;
      if (result.targetDied) {
        return deadCreature(c, Date.now(), Math.random);
      }
      return { ...c, hp: result.targetHp, behavior: 'chase' as const };
    });

    let updatedPlayer = {
      ...state.player, lastAttackAt: now,
      inventory: ammoItem ? removeItem(state.player.inventory, ammoItem, 1) : state.player.inventory,
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
        const luck = equipmentStats(updatedPlayer).luck;
        const loot = applyHordeCall(eliteLoot(scaleHordeAmmo(rollCreatureLoot(def, Math.random, luck), creature.id), creature), creature.id, state.hordeCall); // Enfurecido ×2; horda chamada +bônus
        // Economia de loot: acumula valor de caça e rola um bônus de raridade
        // por marco (aditivo à lootTable; diminishing por espécie).
        const newHunt = (updatedPlayer.huntValue ?? 0) + creatureXp(def);
        const seen = updatedPlayer.huntSeen?.[creature.speciesId] ?? 0;
        const bonus = rollBonusLoot(def, newHunt, seen, Math.random, luck);
        updatedPlayer = {
          ...updatedPlayer,
          huntValue: newHunt,
          huntSeen: { ...(updatedPlayer.huntSeen ?? {}), [creature.speciesId]: seen + 1 },
        };
        if (bonus) loot.push(bonus);
        // Loot DIRETO pro inventário (empilha); overflow (cheio/peso) cai num saco. Mesmo
        // comportamento do rewardCreatureDeath — antes o golpe do player (e o idle, que usa
        // este mesmo attack) jogava o loot no chão e não coletava. Sem diálogo.
        let inv = updatedPlayer.inventory;
        const overflow: typeof loot = [];
        for (const drop of loot) {
          if (!drop.itemId) continue;
          if (canAddItem(inv, drop.itemId, drop.quantity)) { inv = addItem(inv, drop.itemId, drop.quantity); drafts.push(lootEvent(drop.itemId, drop.quantity, creature.position)); }
          else overflow.push(drop);
        }
        updatedPlayer = { ...updatedPlayer, inventory: inv };
        if (overflow.length > 0) {
          updatedBags = pushBag(state.deathBags, createDeathBag(creature.id, creature.name, creature.position, overflow));
        }
        if (loot.length > 0) {
          msg += bonus ? ` ✦ ${ITEMS[bonus.itemId]?.name ?? 'Raro'} dropou!` : overflow.length === loot.filter(d => d.itemId).length ? '' : ` Loot coletado!`;
          if (overflow.length > 0) msg += ' Bolsa cheia: parte do loot ficou pra trás.';
        }
      }
      updatedPlayer = { ...updatedPlayer, gold: updatedPlayer.gold + 15 };
      const xpGain = eliteXp(creatureXp(def ?? creature), creature); // Enfurecido: +50%
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
          updatedBags = pushBag(updatedBags, bag);
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

    // PASSIVO: AoE de melee (espada/machado) ACIMA DO LVL 5 — o golpe normal acerta mais
    // inimigos num raio PEQUENO (do herói, não da base). Só sword/axe/lâminas (não arco/arma
    // de fogo, não pickaxe/tocha). Reusa resolveAttack + rewardCreatureDeath (loot direto).
    const cleaveWeapon = !usingRanged && heldItemId != null && heldItemId !== 'torch'
      && !heldItemId.includes('pickaxe') && (ITEMS[heldItemId]?.attackPower ?? 0) > 0;
    if (cleaveWeapon && !updatedPlayer.dead && state.player.level >= 5) {
      const CLEAVE_RADIUS = 3, CLEAVE_MAX = 7; // raio 3 m (corpo a corpo) + o alvo = até 8 inimigos
      let extra = 0;
      updatedCreatures = updatedCreatures.map(c => {
        if (extra >= CLEAVE_MAX || c.id === targetId || c.behavior === 'dead' || !sameLayerAsPlayer(c.id)) return c;
        if (getDistance(state.player.position, c.position) > CLEAVE_RADIUS) return c;
        extra += 1;
        const r = resolveAttack(finalPower, c.hp, c.maxHp, c.armor, c.name, playerCritStats(state.player));
        drafts.push(damageEvent(c.id, r.damage, c.position, { critical: !!r.critical, fire: usingTorch }));
        if (r.targetDied) {
          const reward = rewardCreatureDeath(c, updatedPlayer, updatedBags, drafts, Math.random);
          updatedPlayer = reward.player;
          updatedBags = reward.bags;
          return deadCreature(c, Date.now(), Math.random);
        }
        return { ...c, hp: r.targetHp, behavior: 'chase' as const };
      });
    }

    set({
      player: updatedPlayer,
      creatures: updatedCreatures,
      deathBags: updatedBags,
      attackTick: state.attackTick + 1,
      feedback: pushEvents(state.feedback, drafts, stamp),
      ui: { ...state.ui, message: msg, ...(updatedPlayer.dead && !state.player.dead ? { deathBy: { name: creature.name, pvp: false } } : {}) },
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
    const power = Math.round((base + equipmentStats(state.player).damage) * (kind === 'jump' ? 1.8 : 1.2) * dmgMult);

    const pos = state.player.position;
    const drafts: FeedbackDraft[] = [];
    let updatedPlayer: PlayerState = { ...state.player, lastSpecialAt: now };
    let updatedBags = state.deathBags;
    let hits = 0;
    audioManager.playMelee(); // especial (salto/giro) = melee

    const creatures = state.creatures.map(c => {
      if (c.behavior === 'dead' || !sameLayerAsPlayer(c.id)) return c;
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

  boostFire: (auto = false) => {
    const st = get();
    if (st.player.dead) return;
    if (st.player.level < BOOST_UNLOCK_LEVEL) {
      if (!auto) set(s => ({ ui: { ...s.ui, message: 'Boost Fire desbloqueia no nível ' + BOOST_UNLOCK_LEVEL + '.' } }));
      return;
    }
    const nowS = Date.now() / 1000;
    const cd = boostCooldown(st.player.level);
    const since = nowS - st.lastBoostFireAt;
    if (since < cd) {
      if (!auto) set(s => ({ ui: { ...s.ui, message: 'Boost Fire recarregando (' + Math.ceil(cd - since) + 's).' } }));
      return;
    }
    const selSlot = st.player.inventory.hotbar.slots[st.ui.selectedHotbar];
    const held = selSlot != null ? st.player.inventory.slots[selSlot]?.itemId ?? null : null;
    if (auto) {
      // Piloto: só com arma de fogo na mão e hostil no alcance (não gasta o boost à toa).
      if (!held || !BOOST_ITEMS.has(held)) return;
      const reach = weaponRangeFor(held, st.player.level);
      if (!st.creatures.some(c => isPowerTarget(c) && getDistance(st.player.position, c.position) <= reach)) return;
    }
    set(s => ({
      boostFireUntil: Date.now() + BOOST_DURATION_MS, lastBoostFireAt: nowS,
      ui: auto ? s.ui : { ...s.ui, message: '🔥 Boost Fire! Pistola e rifle atiram 2× mais rápido por 4 s.' },
    }));
  },

  arrowRain: (auto = false) => {
    const state = get();
    if (state.player.dead) return;

    // DESBLOQUEIA no nível 5 (1º poder do herói — Pedro).
    if (state.player.level < ARROW_RAIN_UNLOCK_LEVEL) {
      if (!auto) set(s => ({ ui: { ...s.ui, message: `Chuva de Flechas desbloqueia no nível ${ARROW_RAIN_UNLOCK_LEVEL}.` } }));
      return;
    }

    // PODER do herói: funciona com QUALQUER arma na mão (até espada) — não é exclusivo do arco.
    const selSlot = state.player.inventory.hotbar.slots[state.ui.selectedHotbar];
    const heldId = selSlot != null ? state.player.inventory.slots[selSlot]?.itemId ?? null : null;
    const prof = weaponFor(heldId);

    const ARROW_RAIN_ARROWS = 5;        // flechas por ONDA (caem do céu)
    const now = Date.now() / 1000;
    const cooldown = arrowRainCooldownFor(state.player.level);

    // SÓ cooldown gateia (Pedro: sem mana/stamina/munição — o tempo de 15 s já determina).
    const since = now - state.lastArrowRainAt;
    if (since < cooldown) {
      if (!auto) set(s => ({ ui: { ...s.ui, message: `Chuva de Flechas recarregando (${Math.ceil(cooldown - since)}s).` } }));
      return;
    }
    const gap = powerGapLeft(state, now);
    if (gap > 0) {
      if (!auto) set(s => ({ ui: { ...s.ui, message: `Aguarde ${Math.ceil(gap)}s entre um poder e outro.` } }));
      return;
    }

    // Alcance de MIRA do poder (fixo, independente da arma — a chuva vem do céu): pega o hostil
    // mais próximo até 20 m pra virar o centro da 1ª onda.
    const reach = 20;
    const nearestHostile = (): Position | null => {
      let best: Position | null = null, bestD = Infinity;
      for (const c of get().creatures) {
        if (c.behavior === 'dead' || !sameLayerAsPlayer(c.id)) continue;
        const d = getDistance(get().player.position, c.position);
        if (d <= reach && d < bestD) { bestD = d; best = c.position; }
      }
      return best;
    };
    if (!nearestHostile()) {
      if (!auto) set(s => ({ ui: { ...s.ui, message: 'Nenhum alvo no alcance da Chuva de Flechas.' } }));
      return;
    }

    // Dispara AGORA (trava o cooldown) e agenda as outras ondas, 1 s entre elas (Pedro: "3 chuvas").
    set(s => ({ lastArrowRainAt: now, ui: { ...s.ui, message: '🏹 Chuva de Flechas!' } }));

    const fireWave = () => {
      const st = get();
      if (st.player.dead) return;
      const center = nearestHostile(); // recalcula: a chuva acompanha os bichos a cada onda
      if (!center) return;
      // Som por onda: sempre FLECHA — a chuva é de flechas, com qualquer arma na mão (Pedro).
      audioManager.playShot();
      const radius = arrowRainRadiusFor(st.player.level);
      const base = playerBaseAttack(st.player.level) + (heldId ? (ITEMS[heldId]?.attackPower ?? 0) : 0);
      const power = Math.round((base + equipmentStats(st.player).damage) * 1.3 * damageMultiplier(st.player));
      const critStats = playerCritStats(st.player);
      const drafts: FeedbackDraft[] = [];

      // VISUAL: flechas caem do céu na área (Projectiles via 'shot'; origem no mesmo ponto do
      // chão com sourceHeight alto → cai reto de cima). Vale no manual E no idle.
      for (let i = 0; i < ARROW_RAIN_ARROWS; i++) {
        const ang = Math.random() * Math.PI * 2;
        const rr = Math.sqrt(Math.random()) * radius;
        const drop = { x: center.x + Math.cos(ang) * rr, z: center.z + Math.sin(ang) * rr };
        drafts.push(shotEvent(drop, drop, 'arrow', 13));
      }

      // NÃO mexe em `lastAttackAt` (poder à parte, não trava o tiro normal) nem gasta munição
      // (só cooldown gateia — Pedro).
      let updatedPlayer: PlayerState = { ...st.player };
      let updatedBags = st.deathBags;
      let hits = 0;

      const creatures = st.creatures.map(c => {
        if (c.behavior === 'dead' || !sameLayerAsPlayer(c.id)) return c;
        if (getDistance(center, c.position) > radius) return c;
        hits += 1;
        const r = resolveAttack(power, c.hp, c.maxHp, c.armor, c.name, critStats);
        drafts.push(damageEvent(c.id, r.damage, c.position, { critical: !!r.critical }));
        if (r.targetDied) {
          const reward = rewardCreatureDeath(c, updatedPlayer, updatedBags, drafts, Math.random);
          updatedPlayer = reward.player;
          updatedBags = reward.bags;
          return deadCreature(c, Date.now(), Math.random);
        }
        return { ...c, hp: r.targetHp, behavior: 'chase' as const };
      });

      set({
        player: updatedPlayer,
        creatures,
        deathBags: updatedBags,
        feedback: pushEvents(get().feedback, drafts, Date.now()),
        ui: { ...get().ui, message: `🏹 Chuva de Flechas! ${hits} atingido(s).` },
      });
    };

    fireWave(); // onda 1 agora
    for (let w = 1; w < ARROW_RAIN_WAVES; w++) setTimeout(fireWave, w * ARROW_RAIN_WAVE_MS); // ondas 2 e 3
  },

  castHeroPower: (id, auto = false) => {
    const st = get();
    if (st.player.dead) return;
    const label = HERO_POWER_LABEL[id];
    const need = HERO_POWER_UNLOCK[id];
    if (st.player.level < need) {
      if (!auto) set(s => ({ ui: { ...s.ui, message: `${label} desbloqueia no nível ${need}.` } }));
      return;
    }
    // SÓ cooldown gateia (igual à Chuva: sem mana/stamina/munição).
    const now = Date.now() / 1000;
    const cd = heroPowerCooldown(id, st.player.level);
    const since = now - st.heroPowers.lastAt[id];
    if (since < cd) {
      if (!auto) set(s => ({ ui: { ...s.ui, message: `${label} recarregando (${Math.ceil(cd - since)}s).` } }));
      return;
    }
    const gap = powerGapLeft(st, now);
    if (gap > 0) {
      if (!auto) set(s => ({ ui: { ...s.ui, message: `Aguarde ${Math.ceil(gap)}s entre um poder e outro.` } }));
      return;
    }
    const me = st.player.position;
    const radius = heroPowerRadius(id, st.player.level);
    const reach = id === 'lightning' ? radius : radius + 3;
    const near = st.creatures.filter(isPowerTarget)
      .map((c) => ({ c, d: getDistance(me, c.position) }))
      .filter((h) => h.d <= reach)
      .sort((a, b) => a.d - b.d);
    // No idle só gasta com hostil perto; o Raio precisa de alvo sempre.
    if ((auto || id === 'lightning') && near.length === 0) {
      if (!auto) set(s => ({ ui: { ...s.ui, message: `Nenhum alvo no alcance do ${label}.` } }));
      return;
    }
    const nowMs = Date.now();
    const lastAt = { ...st.heroPowers.lastAt, [id]: now };

    if (id === 'boomerang') {
      set(s => ({ heroPowers: { ...s.heroPowers, lastAt, boomerangStart: nowMs, boomerangUntil: nowMs + BOOMERANG_DURATION_MS }, ui: { ...s.ui, message: '🪃 Bumerangues!' } }));
      audioManager.playShot();
      return;
    }
    if (id === 'tornado') {
      // 2 tornados saem na direção do hostil mais perto (sem alvo no manual: pra frente +z).
      const aim = near[0]?.c.position;
      const dir = aim ? { x: aim.x - me.x, z: aim.z - me.z } : { x: 0, z: 1 };
      set(s => ({
        heroPowers: { ...s.heroPowers, lastAt, tornadoStart: nowMs, tornadoUntil: nowMs + TORNADO_DURATION_MS, tornadoOrigin: { ...me }, tornadoDir: dir, lastTickAt: 0 },
        ui: { ...s.ui, message: '🌪️ Furacão!' },
      }));
      get().tickHeroPowers(nowMs); // já acerta quem está colado
      return;
    }

    // RAIO: relâmpagos nos hostis mais próximos (+ respingo pequeno em volta de cada um).
    const power = heroPowerBase(st) * LIGHTNING_DMG_MULT;
    const targets = near.slice(0, LIGHTNING_TARGETS);
    const hits = new Map<string, { power: number; push: Vec2 | null }>();
    for (const t of targets) hits.set(t.c.id, { power, push: null });
    for (const t of targets) {
      for (const c of st.creatures) {
        if (!hits.has(c.id) && isPowerTarget(c) && getDistance(t.c.position, c.position) <= LIGHTNING_SPLASH) {
          hits.set(c.id, { power: power * 0.5, push: null });
        }
      }
    }
    const bolts = [
      ...st.heroPowers.bolts.filter((b) => nowMs - b.at < LIGHTNING_BOLT_MS),
      ...targets.map((t) => ({ x: t.c.position.x, z: t.c.position.z, at: nowMs })),
    ];
    const patch = heroStrike(st, hits);
    set(s => ({ ...(patch ?? {}), heroPowers: { ...s.heroPowers, lastAt, bolts }, ui: { ...s.ui, message: `⚡ Raio! ${targets.length} atingido(s).` } }));
    audioManager.playGunShot();
  },

  tickHeroPowers: (nowMs) => {
    const st = get();
    const hp = st.heroPowers;
    const boom = nowMs < hp.boomerangUntil;
    const torn = nowMs < hp.tornadoUntil;
    if ((!boom && !torn) || st.player.dead) return;
    if (nowMs - hp.lastTickAt < HERO_POWER_TICK_MS) return;
    const me = st.player.position;
    const base = heroPowerBase(st); // força do herói (sobe com o nível)
    const blades = boom
      ? heroBoomerangPositions(me, (nowMs - hp.boomerangStart) / BOOMERANG_DURATION_MS, nowMs)
      : [];
    const twisters = torn
      ? heroTornadoPositions(hp.tornadoOrigin, hp.tornadoDir, (nowMs - hp.tornadoStart) / TORNADO_DURATION_MS)
      : [];
    const bR2 = BOOMERANG_HIT_RADIUS * BOOMERANG_HIT_RADIUS;
    const tR2 = HERO_TORNADO_HIT_RADIUS * HERO_TORNADO_HIT_RADIUS;
    const hits = new Map<string, { power: number; push: Vec2 | null }>();
    for (const c of st.creatures) {
      if (!isPowerTarget(c)) continue;
      // Furacão: quem o tornado cruza leva dano + EMPURRÃO forte pra longe dele.
      const tw = twisters.find((t) => (t.x - c.position.x) ** 2 + (t.z - c.position.z) ** 2 <= tR2);
      if (tw) {
        hits.set(c.id, { power: base * TORNADO_DMG_MULT, push: pushAway(tw, c.position, HERO_TORNADO_PUSH) });
        continue;
      }
      if (blades.some((b) => (b.x - c.position.x) ** 2 + (b.z - c.position.z) ** 2 <= bR2)) {
        hits.set(c.id, { power: base * BOOMERANG_DMG_MULT, push: pushAway(me, c.position, BOOMERANG_PUSH) });
      }
    }
    const patch = heroStrike(st, hits);
    set(s => ({ ...(patch ?? {}), heroPowers: { ...s.heroPowers, lastTickAt: nowMs } }));
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
      if (node.depleted || layers.player !== 0) continue; // fundo da caverna: os recursos estão lá em cima
      const def = HARVEST_NODES[node.kind];
      if (!def) continue;
      const d = getDistance(pos, node.position);
      if (d <= harvestRangeFor(def.range, state.player.level) + 0.5 && d < bestNodeDist) { bestNodeDist = d; bestNode = node; }
    }

    // Recurso solto mais próximo (cristal/baú/torre), até 4 m.
    let bestRes: ResourceNode | null = null;
    let bestResDist = Infinity;
    for (const node of state.resources) {
      if (node.depleted || layers.player !== 0) continue;
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

  assignHotbar: (hotIndex, invIndex) => {
    const inv = get().player.inventory;
    const slot = inv.slots[invIndex];
    if (!slot?.itemId || hotIndex < 0 || hotIndex > 99) return;
    const name = ITEMS[slot.itemId]?.name ?? 'Item';
    const slots = inv.hotbar.slots.map(v => (v === invIndex ? null : v));
    while (slots.length <= hotIndex) slots.push(null);
    slots[hotIndex] = invIndex;
    set(s => ({
      player: { ...s.player, inventory: { ...s.player.inventory, hotbar: { ...s.player.inventory.hotbar, slots } } },
      ui: { ...s.ui, message: `${name} na tecla ${hotIndex === 9 ? 0 : hotIndex + 1}.` },
    }));
  },

  useHotbarSlot: (index: number, opts?: { manual?: boolean }) => {
    const state = get();
    const invSlotIdx = state.player.inventory.hotbar.slots[index];
    if (invSlotIdx == null) return;

    const slot = state.player.inventory.slots[invSlotIdx];
    if (!slot?.itemId) return;

    const item = ITEMS[slot.itemId];
    if (!item) return;
    // Travado por nível (unlockSystem): fica na mochila, não vai pra mão.
    if (!isUnlocked(item.id, state.player.level)) {
      set(s => ({ ui: { ...s.ui, message: lockedMessage(item.name, item.id) } }));
      return;
    }

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
      const newHp = Math.min(effectiveMaxHp(state.player), state.player.hp + item.healAmount);
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
    // KIT DE MOBILIDADE = FIXO do personagem (Pedro 29/10: "ela tem que estar no loot"): não sai da mochila
    if (isMobilityItem(itemId)) { set(s => ({ ui: { ...s.ui, message: `🏄 ${ITEMS[itemId!]?.name ?? 'Esse item'} é seu pra sempre — não dá pra descartar.` } })); return; }
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
      player: { ...s.player, hp: effectiveMaxHp(s.player), mana: s.player.maxMana, stamina: s.player.maxStamina },
      ui: { ...s.ui, panelMessage: 'Descansou na base. Vida, mana e vigor restaurados.' },
    }));
  },

  setMode: (mode) => set(s => ({ ui: { ...s.ui, mode } })),
  setPanel: (panel) => set(s => ({ ui: { ...s.ui, panel, panelMessage: '' } })),
  toggleSidebar: () => set(s => ({ ui: { ...s.ui, sidebarCollapsed: !s.ui.sidebarCollapsed } })),
  toggleChat: () => set(s => ({ ui: { ...s.ui, chatOpen: !s.ui.chatOpen } })),
  setMessage: (msg) => set(s => ({ ui: { ...s.ui, message: msg } })),

  tickNightFlock: (night) => {
    if (!canSimulateSharedWorld()) return; // online: o host decide (o convidado recebe na foto do mundo)
    const st = get();
    const has = st.creatures.some((c) => c.id.startsWith(NIGHT_FLOCK_PREFIX));
    const act = nightFlockAction(night, has);
    if (act === 'spawn') set((s) => ({ creatures: [...s.creatures, ...createNightPigeons(s.player.position)] }));
    else if (act === 'leave') set((s) => ({ creatures: s.creatures.filter((c) => !c.id.startsWith(NIGHT_FLOCK_PREFIX)) }));
    // Morto-vivo só à noite (26/10): mesma regra de chegar/ir embora, espalhados pelo mapa.
    const hasZ = get().creatures.some((c) => c.id.startsWith(NIGHT_ZOMBIE_PREFIX));
    const actZ = nightFlockAction(night, hasZ);
    if (actZ === 'spawn') set((s) => ({ creatures: [...s.creatures, ...createNightZombies(Math.random, undefined, s.player.position)] }));
    else if (actZ === 'leave') set((s) => ({ creatures: s.creatures.filter((c) => !c.id.startsWith(NIGHT_ZOMBIE_PREFIX)) }));
  },

  spawnBoss: () => {
    const state = get();
    if (layers.player !== 0) return; // dentro da caverna: o chefe da superfície espera você sair (31/10)
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
    let x = isClassicWorld() ? Math.max(-margin, Math.min(margin, p.x + 20)) : clampX(p.x + 20, 6);
    let z = p.z;
    // Nasce 16–26 m do jogador: longe o bastante pra ser um susto, perto o
    // bastante pra já entrar no aggro (30) e vir caçar imediatamente.
    for (let i = 0; i < 24; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 16 + Math.random() * 10;
      const classic = isClassicWorld();
      const cx = classic ? Math.max(-margin, Math.min(margin, p.x + Math.sin(ang) * r)) : clampX(p.x + Math.sin(ang) * r, 6);
      const cz = classic ? Math.max(-margin, Math.min(margin, p.z + Math.cos(ang) * r)) : clampZ(p.z + Math.cos(ang) * r, 6);
      if (!classic && WORLD.walkable && !WORLD.walkable(cx, cz)) continue; // Zona Sul: nunca no mar/Lagoa
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
      ui: { ...s.ui, message: `⚠️ ${def.name} surgiu ${isClassicWorld() ? 'no vale' : 'por perto'}! Prepare-se.` },
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
    if (!isUnlocked(itemId, get().player.level)) { set(s => ({ ui: { ...s.ui, message: lockedMessage(item.name, itemId) } })); return; }
    const routed = slotForItem(item);
    if (!routed) return;
    set(s => {
      const inv = s.player.inventory;
      const slot: EquipmentKey = routed === 'ring1' || routed === 'ring2' ? ringSlotForEquipment(inv.equipment) : routed;
      const previous = inv.equipment[slot];
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
      // O equipado CONTINUA na mochila (a hotbar aponta pra ele): só devolve o anterior se ele não estiver lá
      // (29/10: equipar/tirar duplicava a peça a cada volta — 1→2→3).
      const withReturned = previous && previous !== itemId && !inv.slots.some(sl => sl.itemId === previous) ? addItem(inv, previous, 1) : inv;
      const equipped = { ...s.player, inventory: { ...withReturned, hotbar, equipment: { ...withReturned.equipment, [slot]: itemId } } };
      return {
        // armadura/acessório mexem em carga% → peso máx acompanha.
        player: syncCarry({ ...equipped, hp: Math.min(equipped.hp, effectiveMaxHp(equipped)) }),
        ui: { ...s.ui, message: `${item.name} equipado.` },
      };
    });
  },

  unequipSlot: (slot) => {
    set(s => {
      const current = s.player.inventory.equipment[slot];
      if (!current) return {};
      const name = ITEMS[current]?.name ?? 'Item';
      // já está na mochila (o equipado nunca sai dela) → só limpa o slot; senão (save antigo) devolve 1
      const inventory = s.player.inventory.slots.some(sl => sl.itemId === current) ? s.player.inventory : addItem(s.player.inventory, current, 1);
      return {
        player: (() => {
          const unequipped = { ...s.player, inventory: { ...inventory, equipment: { ...inventory.equipment, [slot]: null } } };
          return syncCarry({ ...unequipped, hp: Math.min(unequipped.hp, effectiveMaxHp(unequipped)) });
        })(),
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
    const ticked = tickCity(state, Date.now());
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
    const LEVEL = 10, WOOD = 200, STONE = 400, WAVE = 4; // custo dobrado (Pedro) · onda mínima
    if ((s.wave?.wave ?? 1) < WAVE) {
      set({ ui: { ...s.ui, message: `Casa de pedra: só a partir da onda ${WAVE}.` } });
      return;
    }
    if ((s.player.level ?? 1) < LEVEL) {
      set({ ui: { ...s.ui, message: `Casa de pedra: precisa ser nível ${LEVEL}.` } });
      return;
    }
    // Armazém compartilhado: paga com armazém + bolsa (armazém primeiro).
    const pay = payWithBaseStorage(s, (inv) => {
      const w = getItemCount(inv, 'wood'), st = getItemCount(inv, 'stone');
      if (w < WOOD || st < STONE) return { inventory: inv, ok: false, w, st };
      return { inventory: removeItem(removeItem(inv, 'wood', WOOD), 'stone', STONE), ok: true, w, st };
    });
    if (!pay.result.ok) {
      set({ ui: { ...s.ui, message: `Falta material: ${WOOD} madeira + ${STONE} pedra (armazém + bolsa: ${pay.result.w}/${pay.result.st}).` } });
      return;
    }
    set({ baseEvolved: true, base: { ...pay.base, resources: pay.resources }, stats: { ...s.stats, basesEvolved: s.stats.basesEvolved + 1 }, player: syncCarry({ ...s.player, inventory: pay.inventory }), ui: { ...s.ui, message: 'Casa evoluída para PEDRA! 🏰' } });
  },

  evolveBaseToMetal: () => {
    const s = get();
    if (s.baseMetal) return;
    if (!s.baseEvolved) {
      set({ ui: { ...s.ui, message: 'Casa de metal: evolua para PEDRA primeiro.' } });
      return;
    }
    const LEVEL = 20, WOOD = 460, STONE = 920, WAVE = 8; // custo dobrado (Pedro) — 2.3x da pedra · onda mínima
    if ((s.wave?.wave ?? 1) < WAVE) {
      set({ ui: { ...s.ui, message: `Casa de metal: só a partir da onda ${WAVE}.` } });
      return;
    }
    if ((s.player.level ?? 1) <= LEVEL) {
      set({ ui: { ...s.ui, message: `Casa de metal: precisa ser acima do nível ${LEVEL}.` } });
      return;
    }
    // Armazém compartilhado: paga com armazém + bolsa (armazém primeiro).
    const pay = payWithBaseStorage(s, (inv) => {
      const w = getItemCount(inv, 'wood'), st = getItemCount(inv, 'stone');
      if (w < WOOD || st < STONE) return { inventory: inv, ok: false, w, st };
      return { inventory: removeItem(removeItem(inv, 'wood', WOOD), 'stone', STONE), ok: true, w, st };
    });
    if (!pay.result.ok) {
      set({ ui: { ...s.ui, message: `Falta material: ${WOOD} madeira + ${STONE} pedra (armazém + bolsa: ${pay.result.w}/${pay.result.st}).` } });
      return;
    }
    set({ baseMetal: true, base: { ...pay.base, resources: pay.resources }, stats: { ...s.stats, basesEvolved: s.stats.basesEvolved + 1 }, player: syncCarry({ ...s.player, inventory: pay.inventory }), ui: { ...s.ui, message: 'Casa evoluída para METAL! ⚙️' } });
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
    // 2 passos: o prédio Campo de Guerra (cidade) já cobra do armazém por conta própria; a peça física
    // paga com o que SOBROU no armazém + bolsa (sem contar a mesma madeira 2×).
    const now = Date.now();
    const city0 = tickCity(s, now);
    const dry = buildTrainingCamp(city0, s.playerBase, combineStorage(s.player.inventory, city0.resources), now);
    if (!dry.ok) { set({ ui: { ...s.ui, message: dry.message } }); return; }
    const combined = combineStorage(s.player.inventory, dry.base.resources);
    const result = buildTrainingCamp(city0, s.playerBase, combined, now);
    if (!result.ok) { set({ ui: { ...s.ui, message: result.message } }); return; }
    const paid = splitSpend(s.player.inventory, dry.base.resources, combined, result.inventory);
    set({ base: { ...result.base, resources: paid.resources }, playerBase: result.playerBase, player: { ...s.player, inventory: paid.inventory }, ui: { ...s.ui, message: result.message } });
  },

  constructNextWall: () => {
    const s = get();
    const pay = payWithBaseStorage(s, (inv) => buildNextWall(s.playerBase, inv, Date.now()));
    const result = pay.result;
    set({ playerBase: result.playerBase, ...(result.ok ? { base: { ...pay.base, resources: pay.resources } } : {}), player: { ...s.player, inventory: pay.inventory }, ui: { ...s.ui, message: result.message } });
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
    // Armazém compartilhado: entrega com armazém + bolsa (armazém primeiro).
    const city = tickCity(s, Date.now());
    const combined = combineStorage(s.player.inventory, city.resources);
    let inv = combined;
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
    const paid = splitSpend(s.player.inventory, city.resources, combined, inv);
    set({ playerBase: base, base: { ...city, resources: paid.resources }, player: { ...s.player, inventory: paid.inventory }, ui: { ...s.ui, message } });
  },

  placeBasePieces: (preview, tier = 1) => {
    const state = get();
    if (!state.playerBase) return;
    const pb = state.playerBase;
    const pay = payWithBaseStorage(state, (inv) => placePlayerPieces(pb, preview, inv, Date.now(), tier));
    const result = pay.result;
    if (!result.ok) {
      set({ ui: { ...state.ui, message: result.message } });
      return;
    }
    set({
      playerBase: advanceStageFully(result.base),
      base: { ...pay.base, resources: pay.resources },
      player: { ...state.player, inventory: pay.inventory },
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
        ? `Brecha no muro! A base está aberta — se o núcleo cair: −${baseFallLevelLoss(state.player.level)} níveis, o farm e 25% do armazém.`
        : state.ui.message;
    if (result.wiped) {
      // Base CAIU na horda → GAME OVER. Para as ondas, limpa os inimigos de onda.
      // Penalidade (Pedro): perde 5 NÍVEIS por base perdida (piso 1), mantendo o resto
      // (itens, atributos, HP). Assim o progresso NÃO zera — o jogador continua vivo e
      // querendo evoluir. 5→1, 10→5, 15→10, 20→15...
      // Pedro (21/10, regra final): −5 níveis + mochila VOLTA AO KIT INICIAL, mas o ESPECIAL
      // fica: armas, armaduras, ferramentas, skills e recursos RAROS+ (ouro, essência,
      // pele de urso...). Perde só o de FARM (recursos comuns, comida). Base some inteira
      // (evolução pedra/metal também — reconstrói de madeira).
      const SPECIAL_CATS = new Set(['weapon', 'armor', 'tool', 'skill']);
      const isSpecial = (id: string) => {
        const it = ITEMS[id];
        return !!it && (SPECIAL_CATS.has(it.category) || (it.category === 'resource' && it.rarity !== 'common'));
      };
      const kit = createInitialPlayer().inventory;
      const slots = kit.slots.map(s => ({ ...s }));
      for (const s of state.player.inventory.slots) {
        if (!s.itemId || !isSpecial(s.itemId)) continue;
        const same = slots.find(k => k.itemId === s.itemId);
        if (same) { same.quantity = Math.max(same.quantity, s.quantity); continue; } // kit já tem (ex.: pistola)
        const empty = slots.find(k => k.itemId === null);
        if (empty) { empty.itemId = s.itemId; empty.quantity = s.quantity; }
      }
      const keptIds = new Set(slots.map(s => s.itemId));
      const eq = state.player.inventory.equipment;
      const keepEq = (id: string | null) => (id && keptIds.has(id) ? id : null);
      // 25/10: 10% do nível (mín. 5, máx. 15) — antes −5 fixo.
      const levelLoss = baseFallLevelLoss(state.player.level);
      const lostLevel = Math.max(1, state.player.level - levelLoss);
      const penalized = syncCarry({
        ...state.player,
        level: lostLevel,
        xp: 0,
        xpToNext: xpForLevel(lostLevel),
        inventory: {
          ...kit, slots,
          // TODOS os slots (genérico: já cobre os 8 de armadura por tier do PR do Caio).
          equipment: Object.fromEntries(
            Object.entries(eq).map(([slot, id]) => [slot, keepEq((id as string | null | undefined) ?? null)]),
          ) as typeof eq,
        },
      });
      const penaltyMsg = lostLevel < state.player.level
        ? `${message} Você perdeu ${state.player.level - lostLevel} níveis (${state.player.level}→${lostLevel}), o farm e 25% do armazém; armas/armaduras/raros ficaram. Reconstrua a base.`
        : `${message} Você perdeu o farm e 25% do armazém; armas/armaduras/raros ficaram. Reconstrua a base.`;
      // Armazém compartilhado (Pedro, 23/10): base caída na HORDA perde 25% do armazém (raid de jogador = 35%, futuro).
      const cityAfterFall = resolveBase(state.base, Date.now());
      set({
        player: penalized,
        base: { ...cityAfterFall, resources: hordeStorageLoss(cityAfterFall.resources) },
        stats: { ...state.stats, basesLost: state.stats.basesLost + 1 },
        playerBase: null,
        baseEvolved: false, // base some inteira: evolução volta pra madeira (Pedro)
        baseMetal: false,
        wave: INITIAL_WAVE,
        baseLevel: 1,
        baseUpgrades: { tower_damage: 0, wall_hp: 0, base_repair: 0, core_hp: 0, orbit_boomerang: 0, tornado: 0 },
        upgradeChoices: null,
        orbitExpiresWave: 0,
        tornadoExpiresWave: 0,
        // Só a MINHA horda some (online a sala tem a horda de cada jogador).
        creatures: state.creatures.filter((c) => !(c.id.startsWith('wave') && isMyWave(c.id))),
        ui: { ...state.ui, message: penaltyMsg, baseFell: true, baseFellLoss: state.player.level - lostLevel },
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
    const ticked = tickCity(state, Date.now());
    const result = depositFromInventory(ticked, state.player.inventory);
    const total = result.moved.wood + result.moved.stone + result.moved.essence + result.moved.food;
    const message = total > 0
      ? `Depositado: ${result.moved.wood} madeira, ${result.moved.stone} pedra, ${result.moved.essence} essência, ${result.moved.food} comida (carne crua).`
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
      // Ligar/desligar o automático ZERA a memória do piloto (alvo "grudado"). Antes: liga no ponto
      // A, anda no manual até B, liga de novo → voltava pro bicho de A (vivo a até 63 m). Pedro, 23/10.
      pilotLastIntent: null,
      // Ligou = marca o ponto de partida; desligou = esquece.
      pilotAnchor: mode === 'idle' ? { ...s.player.position } : null,
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
    const clamped = Math.round(Math.max(5, Math.min(45, radius)));
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

  enterWorld: (map, zs) => {
    const camps = createCamps(Date.now()); // CAMP_PLACEMENTS já é o do mapa ativo
    const wild = map === 'classic' ? [...createInitialCreatures(), ...createWildCreatures()] : zs?.creatures ?? [];
    set(s => ({
      // VOLTA AO VALE: os bichos da horda não existem mais (o mundo foi recriado) → a onda segue a MESMA regra de quando
      // o jogo reabre: combate vira a paz da mesma onda; paz que venceu enquanto você estava fora = 1 min de folga.
      ...(map === 'classic' ? { wave: restoreWave(s.wave, !!s.playerBase, Date.now()) } : {}),
      creatures: [...wild, ...camps.creatures],
      camps: camps.camps,
      harvestNodes: map === 'classic' ? createHarvestNodes() : zs?.harvestNodes ?? [],
      resources: map === 'classic' ? createInitialResources() : zs?.resources ?? [],
      deathBags: [],
      objectives: createQueue(),
      player: { ...s.player, position: zs?.position ?? { x: SAFE_ZONE.x, z: SAFE_ZONE.z } },
    }));
  },

  grantSurfboard: () => get().grantMobilityKit(),

  grantMobilityKit: () => {
    const r = grantMobilityKit(get().player.inventory);
    if (!r.granted.length) return;
    const names = r.granted.map(id => {
      const lv = unlockLevel(id), mine = get().player.level >= lv;
      return `${ITEMS[id]?.name ?? id}${mine ? '' : ` (nível ${lv})`}`;
    });
    const solo = r.granted.length === 1 && r.granted[0] === SURFBOARD_ID && isUnlocked(SURFBOARD_ID, get().player.level);
    set(s => ({ player: { ...s.player, inventory: r.inventory }, ui: { ...s.ui, message: solo
      ? '🏄 Você ganhou uma Prancha de surf' + (r.grewBag ? ' (a mochila ganhou um espaço pra ela)' : '') + ' — selecione na hotbar e entre no mar.'
      : `🏄 Na sua mochila: ${names.join(', ')}${r.grewBag ? ' — a mochila ganhou espaço pra eles' : ''}.` } }));
  },

  drinkPotion: () => {
    const state = get();
    if (state.player.dead) return;
    const result = drinkBestPotion(
      state.player.inventory, state.player.hp, effectiveMaxHp(state.player), DEV_INFINITE_POTIONS,
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

  takePlayerDamage: (amount, sourceName, pvp = false) => {
    if (amount <= 0) return;
    // ESQUIVA (dodgeSystem): no meio do rolamento o golpe ERRA — vale pra PvP e pra mordida vinda do host (online).
    if (isInvulnerable()) { set(s => ({ ui: { ...s.ui, message: `💨 Esquivou de ${sourceName}!` } })); return; }
    const now = Date.now();
    set(s => {
      if (s.player.dead) return {};
      const dmg = Math.max(1, Math.round(amount));
      const hp = Math.max(0, s.player.hp - dmg);
      const feedback = pushEvent(s.feedback, damageEvent(s.player.id, dmg, s.player.position, { onPlayer: true }), now);
      if (hp <= 0) {
        return {
          player: { ...s.player, hp: 0, dead: true, respawnAt: now + 15_000, lastDamagedAt: now },
          feedback,
          ui: { ...s.ui, message: `${sourceName} te derrotou!`, deathBy: { name: sourceName, pvp } },
        };
      }
      return {
        player: { ...s.player, hp, lastDamagedAt: now },
        feedback,
        ui: { ...s.ui, message: `${sourceName} te atingiu! -${dmg} HP (${hp}/${s.player.maxHp})` },
      };
    });
  },

  pruneFeedback: () => {
    const state = get();
    const pruned = pruneEvents(state.feedback, Date.now());
    if (pruned !== state.feedback) set({ feedback: pruned });
  },

  addHuntArea: (x, z, radius) => {
    const state = get();
    const cx = Math.round(isClassicWorld() ? Math.max(-WORLD_HALF, Math.min(WORLD_HALF, x)) : clampX(x));
    const cz = Math.round(isClassicWorld() ? Math.max(-WORLD_HALF, Math.min(WORLD_HALF, z)) : clampZ(z));
    const targetId = `area_${cx}_${cz}`;
    const label = `Caçar na região ${describeRegion(cx, cz)} (${cx}, ${cz})`;
    if (hasPendingObjective(state.objectives, 'hunt_area', targetId)) {
      set(s => ({ ui: { ...s.ui, message: 'Essa área de caça já está na fila.' } }));
      return;
    }
    // Raio grande (zona da Zona Sul) quando pedido; senão o padrão de sempre.
    const areaRadius = radius != null && radius > 0 ? Math.round(radius) : HUNT_AREA_RADIUS;
    const objectives = addQueueObjective(
      state.objectives,
      { kind: 'hunt_area', targetId, position: { x: cx, z: cz }, label, radius: areaRadius },
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

  callHordeNow: () => {
    const s = get();
    if (s.wave.phase !== 'peace' || !s.playerBase?.enclosed) return;
    const now = Date.now();
    const bonus = hordeCallBonus(s.wave.phaseEndsAt - now);
    set({
      wave: { ...s.wave, phaseEndsAt: now },
      hordeCall: { wave: s.wave.wave + 1, bonus },
      ui: { ...s.ui, message: bonus > 0 ? `⚔ Horda chamada! +${Math.round(bonus * 100)}% de loot nesta onda.` : '⚔ Horda chamada!' },
    });
  },

  tickWorld: () => {
    const state = get();
    const now = Date.now();

    // Cura automática também no jogo manual: a regra é pura (`shouldAutoDrink`),
    // quem a aciona é este tick, que roda nos dois modos.
    if (shouldAutoDrink({ ...state.player, maxHp: effectiveMaxHp(state.player) }, state.autoPotion)) {
      get().drinkPotion();
    }

    const discovery = discoverCamps(state.camps, state.player.position);
    // Convidado de sala: os bichos são do host (o snapshot dele sobrescreve) — aqui o tick só
    // cuida do que é MEU (onda da minha base, poção, coleta, objetivos), sem mexer nos bichos.
    const ticked = canSimulateSharedWorld()
      ? tickCamps(discovery.camps, state.creatures, now)
      : { camps: discovery.camps, creatures: state.creatures, newlyCleared: [], respawned: [] };

    let player = state.player;
    const messages: string[] = [];

    // HORDAS (Fase 5): ciclo paz↔combate; spawna a onda ao redor da base.
    let waveState = state.wave;
    let waveCreatures = ticked.creatures;
    let upgradeChoices = state.upgradeChoices;
    let waveSummary: { wave: number; kills: number; seconds: number } | null = null;
    // HORDA em qualquer mapa (31/10, Fase 4: a base veio pra Zona Sul — o mesmo relógio paz↔combate do Vale)
    {
      const center = baseCenter(state.playerBase);
      // Só conta a horda da MINHA base (online cada jogador tem a sua no mesmo mundo).
      const aliveWave = ticked.creatures.filter(
        (c) => c.id.startsWith('wave') && c.hp > 0 && c.behavior !== 'dead' && isMyWave(c.id),
      ).length;
      const wt = tickWaves(state.wave, now, center != null, aliveWave, state.playerBase?.enclosed === true);
      waveState = wt.state;
      const guest = !canSimulateSharedWorld();
      if (wt.startedWave && center) {
        if (guest) {
          // Convidado: o mundo é do host — pede a horda; o pendente só zera quando ela aparecer.
          broadcastWaveSpawn(wt.startedWave, center);
          guestWaveAskedAt = now;
          guestWaveFirstAskAt = now;
        } else {
          const net = useNet.getState();
          const spawned = spawnWaveRaiders(wt.startedWave, center, now, net.connected ? net.selfId : '');
          waveCreatures = [...ticked.creatures, ...spawned];
          waveState = markSpawned(waveState, spawned.length);
        }
      } else if (waveState.phase === 'combat' && waveState.spawnPending > 0 && center) {
        if (aliveWave > 0 || !guest) {
          waveState = markSpawned(waveState, waveState.spawnPending); // horda chegou pelo mundo do host
          guestWaveFirstAskAt = 0;
        } else if (guestWaveFirstAskAt > 0 && now - guestWaveFirstAskAt > GUEST_WAVE_GIVE_UP_MS) {
          waveState = markSpawned(waveState, waveState.spawnPending); // host não respondeu: não trava
          guestWaveFirstAskAt = 0;
        } else if (now - guestWaveAskedAt > GUEST_WAVE_RETRY_MS) {
          broadcastWaveSpawn(waveState.wave, center);
          guestWaveAskedAt = now;
          if (guestWaveFirstAskAt === 0) guestWaveFirstAskAt = now;
        }
      }
      // Onda repelida → os mortos da MINHA horda saem da lista (antes acumulavam ~45 por onda, e todo sistema
      // percorre a lista de bichos).
      // Resumo da onda repelida (Pedro 25/10: vitória curta dentro do ao vivo): abates da MINHA horda dessa onda + tempo.
      if (wt.repelledWave) {
        const tag = `wave${wt.repelledWave}_`;
        const kills = waveCreatures.filter((c) => c.id.startsWith(tag) && isMyWave(c.id) && c.behavior === 'dead').length;
        waveSummary = { wave: wt.repelledWave, kills, seconds: waveStartedMs > 0 ? Math.round((now - waveStartedMs) / 1000) : 0 };
      }
      if (wt.startedWave) waveStartedMs = now;
      if (wt.repelledWave) waveCreatures = waveCreatures.filter((c) => !(c.id.startsWith('wave') && isMyWave(c.id) && c.behavior === 'dead'));
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
        resources: [...state.resources, ...(() => { const fits = harvestFitsChecker(player.inventory); return state.harvestNodes.map(n => ({ ...n, canCollect: fits(n) })); })()],
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
      ui: {
        ...(messages.length > 0 ? { ...current.ui, message: messages[messages.length - 1]! } : current.ui),
        ...(waveSummary ? { waveSummary } : {}),
      },
      // A onda chamada acabou: o bônus de loot dela termina.
      ...(waveSummary && current.hordeCall?.wave === waveSummary.wave ? { hordeCall: null } : {}),
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
      ...(WORLD.id === 'zona-sul' ? { autoExplore: true } : {}),
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
          if (!isUnlocked(slot.itemId, level)) return; // travada por nível: o piloto nem considera
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
      // caverna (layerSystem): o piloto só vê o que está na MESMA camada do herói
      harvestNodes: (layers.player === 0 ? state.harvestNodes : []).map(n => ({
        id: n.id,
        kind: n.kind,
        position: n.position,
        depleted: n.depleted,
      })),
      creatures: state.creatures.filter(c => sameLayerAsPlayer(c.id)).map(c => ({
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
        ...(() => { const fitsNode = harvestFitsChecker(state.player.inventory); return state.harvestNodes.map(n => ({
          id: n.id,
          position: n.position,
          depleted: n.depleted,
          kind: n.kind,
          range: HARVEST_NODES[n.kind] ? harvestRangeFor(HARVEST_NODES[n.kind]!.range, state.player.level) : undefined,
          // Bolsa cheia PRA ESTE recurso (ou sem ferramenta) → o piloto não vai ficar parado nele.
          canCollect: fitsNode(n),
        })); })(),
        ...state.resources.map(r => ({ id: r.id, position: r.position, depleted: r.depleted })),
      ],
      objectives: state.objectives,
      homePosition: HOME_POSITION,
      ...(state.pilotAnchor ? { autoAnchor: state.pilotAnchor } : {}),
      ...(() => {
        const core = state.playerBase?.pieces.find(p => p.kind === 'core');
        return core ? { baseCenter: baseCellCenter(core.cell) } : {};
      })(),
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
