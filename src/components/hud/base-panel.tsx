import { useEffect, useMemo, useState } from 'react';
import { Bed, BrickWall, Castle, DoorOpen, Hammer, Landmark, Lock, LockOpen, ShieldAlert, ShieldCheck, Swords, Warehouse } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGameStore } from '@/game/state/game-store';
import { BASE_TYPES } from '@/game/data/base-types';
import { ITEMS } from '@/game/data/items';
import { UNITS } from '@/game/data/units';
import { UnitSprite } from '@/components/hud/unit-sprite';
import { getItemCount } from '@/game/systems/inventorySystem';
import { getQueueCapacity, getRemainingMs, getTroopCount, getUpgradeBlockReason } from '@/game/systems/baseSystem';
import { nextWall } from '@/game/systems/trainingCampSystem';
import { basePieceCost } from '@/game/systems/baseTypeSystem';
import { MAX_TOWER_LEVEL, resolveTowerLevel, towerUpgradeCost } from '@/game/systems/towerLevelSystem';
import { BaseTypePicker } from './base-type-picker';
import type { BaseStage, BasePieceKind, PlayerBaseState } from '@/game/types/playerbase';
import {
  canOpenCityView, claimLandQuality, stageProgress, STAGE_ORDER, type LandQuality,
} from '@/game/systems/playerBaseSystem';
import {
  BUILD_MODE_KEY_LABEL, setBuildMode, useBuildSelection,
} from './base-build-state';

/** Quanto tempo depois de um dano a base ainda é mostrada "sob ataque". */
export const UNDER_ATTACK_MS = 20_000;

export const STAGE_LABEL: Record<BaseStage, string> = {
  none: 'Sem base',
  bed: 'Cama',
  foundation: 'Fundação',
  walls: 'Muros',
  towers: 'Torres',
  enclosed: 'Perímetro fechado',
  clash: 'Clash',
};

const LAND_LABEL: Record<LandQuality, { name: string; hint: string }> = {
  nobre: { name: 'Terra nobre', hint: 'Perto de acampamento ou do nascedouro: disputada e escassa.' },
  comum: { name: 'Terra comum', hint: 'Distância média de acampamentos e do nascedouro.' },
  fronteira: { name: 'Fronteira', hint: 'Longe de tudo: sempre aberta, ideal para recomeçar.' },
};

const KIND_ROWS: { kind: BasePieceKind; label: string; Icon: React.ComponentType<React.SVGProps<SVGSVGElement>> }[] = [
  { kind: 'core', label: 'Cama', Icon: Bed },
  { kind: 'wall', label: 'Muros', Icon: BrickWall },
  { kind: 'door', label: 'Portas', Icon: DoorOpen },
  { kind: 'tower', label: 'Torres', Icon: Landmark },
  { kind: 'roof', label: 'Telhados', Icon: Warehouse },
  { kind: 'training', label: 'Centro de treinamento', Icon: Castle },
];

/** Por que a vista de cidade ainda está trancada (ou `null` se aberta). */
export function cityLockReason(base: PlayerBaseState | null): string | null {
  if (canOpenCityView(base)) return null;
  if (!base) {
    return 'Cidade trancada: reivindique um terreno e erga a base até fechar o perímetro com ao menos uma porta (estágio Clash).';
  }
  const p = stageProgress(base);
  return `Cidade trancada (estágio atual: ${STAGE_LABEL[base.stage]}). Próximo passo: ${p.requirement} A cidade abre no estágio Clash, com o perímetro fechado e ao menos uma porta.`;
}

/** "Agora" que só tica enquanto `enabled`: a base não pede relógio quando ninguém sofre dano. */
function useNow(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}

export function BasePanel({ onClose }: { onClose: () => void }) {
  // Assinaturas estreitas: a referência de `playerBase` só muda quando a base muda.
  const base = useGameStore(s => s.playerBase);
  const inventory = useGameStore(s => s.player.inventory);
  const upgradeTower = useGameStore(s => s.upgradeTower);
  const setMode = useGameStore(s => s.setMode);
  const setPanel = useGameStore(s => s.setPanel);
  const inCity = useGameStore(s => s.ui.mode === 'city');
  // A cidade (`base`) é a fonte da verdade do treino; o painel é modal, então o
  // mundo 3D fica pausado e `s.base` só muda no tique de 1 s — assinatura barata.
  const cityBase = useGameStore(s => s.base);
  const buildWall = useGameStore(s => s.constructNextWall);
  const buildCamp = useGameStore(s => s.constructTrainingCamp);
  const upgradeBuilding = useGameStore(s => s.upgradeBuilding);
  const evolveBaseToStone = useGameStore(s => s.evolveBaseToStone);
  const baseEvolved = useGameStore(s => s.baseEvolved);
  const evolveBaseToMetal = useGameStore(s => s.evolveBaseToMetal);
  const baseMetal = useGameStore(s => s.baseMetal);
  const playerLevel = useGameStore(s => s.player.level);
  const wave = useGameStore(s => s.wave.wave);
  const build = useBuildSelection();
  const key = BUILD_MODE_KEY_LABEL;
  const warCamp = cityBase.buildings.find(b => b.defId === 'war_camp') ?? null;
  const campQueue = warCamp?.queue ?? [];
  // Relógio só tica sob ataque ou com fila em andamento: sem fila, nada a animar.
  const now = useNow(Boolean(base?.lastDamagedAt) || campQueue.length > 0);

  const counts = useMemo(() => {
    const c: Record<BasePieceKind, number> = { core: 0, wall: 0, door: 0, tower: 0, roof: 0, training: 0 };
    for (const p of base?.pieces ?? []) c[p.kind] += 1;
    return c;
  }, [base?.pieces]);

  const enterBuild = () => {
    setBuildMode(true);
    if (inCity) setMode('world');
    onClose();
  };

  if (!base) {
    return (
      <>
        <div className="base-empty">
          <Landmark aria-hidden="true" />
          <div>
            <strong>Você ainda não tem uma base</strong>
            <p>
              Reivindicar é marcar um quadrado de terreno livre só seu. Depois você ergue muros, porta, torre e
              telhado dentro dele, e a cama no centro vira seu ponto de partida. Fechando o perímetro, a cidade abre.
            </p>
            <p>
              Para começar, entre no modo de construção{key ? <> (tecla <kbd>{key}</kbd>)</> : null} e escolha o
              terreno no mundo.
            </p>
          </div>
        </div>
        <div className="base-lock" data-locked="true" role="status">
          <Lock aria-hidden="true" /><span>{cityLockReason(null)}</span>
        </div>
        <BaseTypePicker />
        <div className="panel-actions">
          <Button onClick={enterBuild} title={`Entrar no modo de construção${key ? ` · ${key}` : ''}`}
            aria-label="Entrar no modo de construção">
            <Hammer />Entrar no modo de construção
          </Button>
        </div>
      </>
    );
  }

  const progress = stageProgress(base);
  const stageIdx = Math.max(0, STAGE_ORDER.indexOf(base.stage) - 1);
  const stageMax = STAGE_ORDER.length - 2;
  const quality = claimLandQuality(base.origin, base.size);
  const land = LAND_LABEL[quality];
  const underAttack = base.lastDamagedAt != null && now - base.lastDamagedAt < UNDER_ATTACK_MS;
  const unlocked = canOpenCityView(base);
  const reopened = unlocked && !base.enclosed;

  // Administração (muro · centro de treinamento · evolução), toda com ações já prontas.
  const campBuilt = base.pieces.some(p => p.kind === 'training');
  const wall = nextWall(base);
  const campCost = basePieceCost('training', 1, base.baseType);
  const wallCost = basePieceCost('wall', 1, base.baseType);
  const costText = (cost: { itemId: string; quantity: number }[]) =>
    cost.map(c => `${c.quantity} ${ITEMS[c.itemId]?.name ?? c.itemId}`).join(' · ') || 'sem custo';
  const campAffordable = campCost.every(c => getItemCount(inventory, c.itemId) >= c.quantity);
  const wallAffordable = wallCost.every(c => getItemCount(inventory, c.itemId) >= c.quantity);
  const upgradeReason = warCamp ? getUpgradeBlockReason(cityBase, warCamp.id) : 'Construa o centro de treinamento primeiro';
  const campReason = campBuilt ? 'Centro de treinamento já construído'
    : !campAffordable ? 'Material insuficiente na mochila' : 'Instalar o centro de treinamento';
  const wallReason = !wall ? 'Muros completos ou terreno não reivindicado'
    : !wallAffordable ? 'Material insuficiente na mochila' : 'Erguer o próximo muro do perímetro';
  const troops = getTroopCount(cityBase);
  const secs = (ms: number) => `${Math.ceil(ms / 1000)}s`;

  return (
    <>
      <div className="base-lock" data-locked={!unlocked} data-warn={reopened} role="status">
        {unlocked ? <LockOpen aria-hidden="true" /> : <Lock aria-hidden="true" />}
        <span>
          {unlocked
            ? (reopened
              ? 'Cidade liberada, mas o perímetro está aberto: conserte a brecha antes que inimigos entrem.'
              : 'Cidade liberada: gerencie a base na vista isométrica.')
            : cityLockReason(base)}
        </span>
      </div>

      <div className="base-stage">
        <p className="base-next">{base.baseType ? `${BASE_TYPES[base.baseType].name} · ${BASE_TYPES[base.baseType].description}` : 'Base original · atributos preservados.'}</p>
        <div className="base-stage-head">
          <span><small>Estágio</small><strong>{STAGE_LABEL[base.stage]}</strong></span>
          <span className="base-chip" data-quality={quality} title={land.hint}><Landmark aria-hidden="true" />{land.name}</span>
          {underAttack && (
            <span className="base-chip" data-alert="true" role="status" title="A base sofreu dano há pouco tempo">
              <ShieldAlert aria-hidden="true" />Sob ataque
            </span>
          )}
        </div>
        <progress value={stageIdx} max={stageMax} aria-label={`Progresso da base: estágio ${STAGE_LABEL[base.stage]}`} />
        <p className="base-next">
          <small>Próximo objetivo</small>
          {progress.next ? <>{progress.requirement}</> : 'Base completa.'}
        </p>
      </div>

      <div className="base-perimeter" data-closed={base.enclosed} role="status"
        title={base.enclosed ? 'Os muros cercam a cama sem nenhuma brecha.' : 'Há uma abertura nos muros: inimigos conseguem chegar à cama.'}>
        {base.enclosed ? <ShieldCheck aria-hidden="true" /> : <ShieldAlert aria-hidden="true" />}
        <strong>Perímetro: {base.enclosed ? 'fechado' : 'aberto — há uma brecha'}</strong>
      </div>

      <div className="base-pieces" aria-label="Peças construídas">
        {KIND_ROWS.map(({ kind, label, Icon }) => (
          <span key={kind} title={`${label}: ${counts[kind]}`} aria-label={`${label}: ${counts[kind]}`} data-empty={counts[kind] === 0}>
            <Icon aria-hidden="true" /><em>{counts[kind]}</em><small>{label}</small>
          </span>
        ))}
      </div>

      {counts.tower > 0 && (
        <section className="base-stage" aria-label="Melhorias das torres">
          <strong>Torres · evolução local</strong>
          {base.pieces.filter(piece => piece.kind === 'tower').map((piece, index) => {
            const level = resolveTowerLevel(piece.tier, piece.level);
            const maxed = level >= MAX_TOWER_LEVEL;
            const cost = towerUpgradeCost(piece.tier, level, base.baseType);
            const affordable = cost.every(c => getItemCount(inventory, c.itemId) >= c.quantity);
            const reason = piece.hp <= 0 ? 'Torre destruída' : maxed ? 'Nível máximo' : !affordable ? 'Recursos insuficientes' : `Melhorar para nível ${level + 1}`;
            return (
              <div key={piece.id} className="base-tower-upgrade">
                <div>
                  <strong>Torre {index + 1} · nível {level}/{MAX_TOWER_LEVEL}</strong>
                  <small>Célula {piece.cell.gx}, {piece.cell.gz} · HP {Math.ceil(piece.hp)}/{Math.ceil(piece.maxHp)}</small>
                  <small>{maxed ? 'Evolução completa' : `Próximo nível: ${cost.map(c => `${c.quantity} ${ITEMS[c.itemId]?.name ?? c.itemId} (${getItemCount(inventory, c.itemId)} disponível)`).join(' + ')}`}</small>
                </div>
                <Button size="sm" variant="outline" disabled={piece.hp <= 0 || maxed || !affordable}
                  title={reason} aria-label={`Torre ${index + 1}: ${reason}`} onClick={() => upgradeTower(piece.id)}>
                  {maxed ? 'Máximo' : piece.hp <= 0 ? 'Destruída' : 'Melhorar'}
                </Button>
              </div>
            );
          })}
        </section>
      )}

      <section className="base-stage" aria-label="Treinamento e muralhas">
        <strong>Tropas e muralhas · administração</strong>

        <div className="base-tower-upgrade">
          <div>
            <strong>Tropas prontas: {troops}</strong>
            <small>{campBuilt
              ? `Centro de treinamento instalado${warCamp ? ` · Campo de Guerra nível ${warCamp.level} · fila ${campQueue.length}/${getQueueCapacity(cityBase, warCamp)}` : ''}`
              : 'Centro de treinamento ainda não construído'}</small>
            <small className="unit-row">{Object.entries(cityBase.troops).map(([id, n]) => (
              <span key={id} className="unit-row" title={UNITS[id]?.name ?? id}><UnitSprite unitId={id} size={22} />{n}</span>
            ))}</small>
            <small>{campQueue.length === 0
              ? 'Nenhuma tropa em treino.'
              : <>Em treino: {campQueue.map(q => (
                <span key={q.id} className="unit-row"><UnitSprite unitId={q.unitId} size={20} />{UNITS[q.unitId]?.name ?? q.unitId} ({q.endsAt == null ? 'aguardando' : secs(getRemainingMs(q, now))})</span>
              ))}</>}</small>
          </div>
          <Button size="sm" variant="outline" title="Abrir o centro de treinamento para treinar tropas"
            aria-label="Abrir o centro de treinamento" onClick={() => setPanel('training')}>
            <Swords />Treinar
          </Button>
        </div>

        <div className="base-tower-upgrade">
          <div>
            <strong>Centro de treinamento</strong>
            <small>{campBuilt ? 'Construído e vinculado ao Campo de Guerra.' : `Mochila: ${costText(campCost)}`}</small>
          </div>
          <Button size="sm" variant="outline" disabled={campBuilt || !campAffordable}
            title={campReason} aria-label={`Construir centro de treinamento: ${campReason}`} onClick={buildCamp}>
            <Castle />{campBuilt ? 'Pronto' : 'Construir'}
          </Button>
        </div>

        <div className="base-tower-upgrade">
          <div>
            <strong>Próximo muro</strong>
            <small>{wall ? `Mochila: ${costText(wallCost)}` : 'Perímetro completo.'}</small>
          </div>
          <Button size="sm" variant="outline" disabled={!wall || !wallAffordable}
            title={wallReason} aria-label={`Construir próximo muro: ${wallReason}`} onClick={buildWall}>
            <BrickWall />Erguer
          </Button>
        </div>

        <div className="base-tower-upgrade">
          <div>
            <strong>Evoluir Campo de Guerra</strong>
            <small>{warCamp ? `Nível ${warCamp.level} · mais vagas de fila e tropas liberadas` : 'Disponível após construir o centro.'}</small>
          </div>
          <Button size="sm" variant="outline" disabled={!warCamp || Boolean(upgradeReason)}
            title={upgradeReason ?? `Evoluir para nível ${(warCamp?.level ?? 0) + 1}`}
            aria-label={`Evoluir Campo de Guerra${upgradeReason ? `: ${upgradeReason}` : ''}`}
            onClick={() => { if (warCamp) upgradeBuilding(warCamp.id); }}>
            <Hammer />Evoluir
          </Button>
        </div>

        <div className="base-tower-upgrade">
          <div>
            <strong>Evoluir Casa (Pedra)</strong>
            <small>{baseEvolved ? 'Casa de pedra ativa ✓' : `Onda 4 + nível 10 + 200 madeira + 400 pedra · casa e muros viram pedra. Onda: ${wave} · nível: ${playerLevel}`}</small>
          </div>
          <Button size="sm" variant="outline" disabled={baseEvolved || wave < 4 || playerLevel < 10}
            title={baseEvolved ? 'Já é de pedra' : wave < 4 ? 'Só a partir da onda 4' : playerLevel < 10 ? 'Precisa ser nível 10' : 'Evoluir para casa de pedra'}
            aria-label="Evoluir casa para pedra"
            onClick={() => evolveBaseToStone()}>
            <Hammer />{baseEvolved ? 'Pedra' : 'Evoluir'}
          </Button>
        </div>
        <div className="base-tower-upgrade">
          <div>
            <strong>Evoluir Casa (Metal)</strong>
            <small>{baseMetal ? 'Casa de metal ativa ✓' : `Onda 8 + pedra + nível >20 + 460 madeira + 920 pedra (2.3x). Onda: ${wave} · nível: ${playerLevel}`}</small>
          </div>
          <Button size="sm" variant="outline" disabled={baseMetal || !baseEvolved || wave < 8 || playerLevel <= 20}
            title={baseMetal ? 'Já é de metal' : !baseEvolved ? 'Precisa ser de pedra antes' : wave < 8 ? 'Só a partir da onda 8' : playerLevel <= 20 ? 'Precisa ser acima do nível 20' : 'Evoluir para casa de metal'}
            aria-label="Evoluir casa para metal"
            onClick={() => evolveBaseToMetal()}>
            <Hammer />{baseMetal ? 'Metal' : 'Evoluir'}
          </Button>
        </div>
      </section>

      <div className="panel-actions">
        <Button variant="outline" onClick={() => { setBuildMode(!build.active); if (!build.active) { if (inCity) setMode('world'); onClose(); } }}
          title={build.active ? 'Sair do modo de construção' : `Entrar no modo de construção${key ? ` · ${key}` : ''}`}
          aria-label={build.active ? 'Sair do modo de construção' : 'Entrar no modo de construção'}>
          <Hammer />{build.active ? 'Sair da construção' : 'Construir'}
        </Button>
        <Button disabled={!unlocked}
          title={unlocked ? 'Abrir a cidade' : (cityLockReason(base) ?? '')}
          aria-label={unlocked ? 'Abrir a cidade' : 'Cidade trancada'}
          onClick={() => { onClose(); setMode('city'); }}>
          {unlocked ? <Castle /> : <Lock />}Abrir a cidade
        </Button>
      </div>
    </>
  );
}
