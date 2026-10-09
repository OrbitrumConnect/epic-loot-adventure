import { useEffect, useMemo, useState } from 'react';
import { Bed, BrickWall, Castle, DoorOpen, Hammer, Landmark, Lock, LockOpen, ShieldAlert, ShieldCheck, Warehouse } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGameStore } from '@/game/state/game-store';
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
  const setMode = useGameStore(s => s.setMode);
  const inCity = useGameStore(s => s.ui.mode === 'city');
  const build = useBuildSelection();
  const key = BUILD_MODE_KEY_LABEL;
  const now = useNow(Boolean(base?.lastDamagedAt));

  const counts = useMemo(() => {
    const c: Record<BasePieceKind, number> = { core: 0, wall: 0, door: 0, tower: 0, roof: 0 };
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
