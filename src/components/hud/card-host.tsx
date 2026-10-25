import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '@/game/state/game-store';
import { DEFAULT_ATTRIBUTES, type PlayerAttributes } from '@/game/types/player';
import { ATTR_HINT, ATTR_LABEL, attributeChoices, autoDistribute, upgradeSuggestions } from '@/game/systems/quickActions';
import { dismissCard, inCombat, INFO_TTL_MS, pushCard, useCards } from './card-queue';

/**
 * Mostra a carta da vez (Pedro 25/10): uma por vez, nunca no meio da luta (aí vira um selinho que dá pra tocar),
 * informativas somem sozinhas, a de NÍVEL fica até escolher. Botões grandes (celular).
 */
export function CardHost() {
  const queue = useCards((s) => s.queue);
  const points = useGameStore((s) => s.player.skillPoints ?? 0);
  const [forced, setForced] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { const id = window.setInterval(() => tick((v) => v + 1), 500); return () => window.clearInterval(id); }, []);
  const card = queue[0];

  // Informativa: some sozinha depois de aparecer.
  useEffect(() => {
    if (!card || card.sticky) return;
    const id = window.setTimeout(() => dismissCard(card.id), INFO_TTL_MS);
    return () => window.clearTimeout(id);
  }, [card]);
  useEffect(() => { if (!card) setForced(false); }, [card]);

  const st = useGameStore.getState();
  const fighting = inCombat(Date.now(), st.player.lastDamagedAt, st.player.lastAttackAt);

  if (!card) {
    // Pontos guardados sem carta na fila (o jogador tocou "depois"): selinho pra reabrir.
    return points > 0 ? (
      <button type="button" className="card-badge" onClick={() => pushCard({ kind: 'level', icon: '✦', title: 'Pontos de atributo', sticky: true }, true)}>
        ✦ {points}
      </button>
    ) : null;
  }
  if (fighting && !forced) {
    return <button type="button" className="card-badge" onClick={() => setForced(true)} title="Abrir carta">🂠 {queue.length}</button>;
  }
  return (
    <div className="game-card" role="dialog" aria-live="polite">
      {card.kind === 'level' ? <LevelCard id={card.id} /> : (
        <>
          <div className="game-card__head"><span className="game-card__icon">{card.icon}</span><b>{card.title}</b></div>
          {card.body && <p className="game-card__body">{card.body}</p>}
          <div className="game-card__actions">
            {(card.actions ?? []).map((a) => (
              <button key={a.label} type="button" className="game-card__btn" onClick={() => { a.run(); dismissCard(card.id); }}>{a.label}{a.hint && <small>{a.hint}</small>}</button>
            ))}
            <button type="button" className="game-card__btn game-card__btn--ghost" onClick={() => dismissCard(card.id)}>{card.sticky ? 'Depois' : 'OK'}</button>
          </div>
        </>
      )}
    </div>
  );
}

/** Carta de NÍVEL: escolha 1 de 3 atributos (+1% cada ponto) ou distribuir tudo automático. */
function LevelCard({ id }: { id: string }) {
  const points = useGameStore((s) => s.player.skillPoints ?? 0);
  const attrs = useGameStore((s) => s.player.attributes) as PlayerAttributes | undefined;
  const cur: PlayerAttributes = { ...DEFAULT_ATTRIBUTES, ...(attrs ?? {}) };
  // Sorteia de novo a cada ponto gasto.
  const choices = useMemo(() => attributeChoices(cur), [points]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (points <= 0) dismissCard(id); }, [points, id]);
  const allocate = useGameStore((s) => s.allocateSkill);
  if (points <= 0) return null;
  return (
    <>
      <div className="game-card__head"><span className="game-card__icon">✦</span><b>Escolha 1 de 3</b><small className="game-card__count">{points} {points === 1 ? 'ponto' : 'pontos'}</small></div>
      <div className="game-card__actions game-card__actions--col">
        {choices.map((a) => (
          <button key={a} type="button" className="game-card__btn" onClick={() => allocate(a)}>
            +1% {ATTR_LABEL[a]} <small>{ATTR_HINT[a]} · agora {cur[a]}%</small>
          </button>
        ))}
        <div className="game-card__row">
          {points > 1 && <button type="button" className="game-card__btn game-card__btn--ghost" onClick={() => { for (const a of autoDistribute(cur, points)) allocate(a); }}>Automático ({points})</button>}
          <button type="button" className="game-card__btn game-card__btn--ghost" onClick={() => dismissCard(id)}>Depois</button>
        </div>
      </div>
    </>
  );
}

/** Lateral "UPAR": prédios da cidade que dá pra subir agora (recurso + construtor livre), sem abrir a cidade. */
export function UpgradeSide() {
  const base = useGameStore((s) => s.base);
  const hasBase = useGameStore((s) => s.playerBase !== null);
  const upgrade = useGameStore((s) => s.upgradeBuilding);
  const list = useMemo(() => (hasBase ? upgradeSuggestions(base, 3) : []), [base, hasBase]);
  if (list.length === 0) return null;
  const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace('.0', '')}k` : `${n}`);
  return (
    <div className="upgrade-side" aria-label="Melhorias disponíveis">
      {list.map((u) => (
        <button key={u.instanceId} type="button" className="upgrade-side__btn" onClick={() => upgrade(u.instanceId)}
          title={`${u.name} ${u.from}→${u.to}`}>
          <b>⬆ {u.name} {u.from}→{u.to}</b>
          <small>{[u.cost.wood && `🪵${fmt(u.cost.wood)}`, u.cost.stone && `🪨${fmt(u.cost.stone)}`, u.cost.food && `🍖${fmt(u.cost.food)}`, u.cost.essence && `✨${fmt(u.cost.essence)}`].filter(Boolean).join(' ')}</small>
          <span className="upgrade-side__go">UPAR</span>
        </button>
      ))}
    </div>
  );
}
