import { useGameStore } from '@/game/state/game-store';
import { Button } from '@/components/ui/button';
import { effectiveAttributes, SKILL_CAP_PER_ATTR } from '@/game/systems/attributesSystem';
import { ATTR_LABEL, ATTR_HINT, autoDistribute } from '@/game/systems/quickActions';
import { DEFAULT_ATTRIBUTES, type PlayerAttributes } from '@/game/types/player';
import { Sparkles, Wand2 } from 'lucide-react';

/** Ordem e ícone de cada atributo na janela (os 4 do jogo). */
const ROWS: { key: keyof PlayerAttributes; icon: string }[] = [
  { key: 'damage', icon: '⚔' },
  { key: 'dexterity', icon: '✦' },
  { key: 'carry', icon: '🎒' },
  { key: 'moveSpeed', icon: '»' },
];

/**
 * JANELA DE ATRIBUTOS — abre ao clicar no card de nível do HUD. Mostra os pontos ACUMULADOS
 * (player.skillPoints) e deixa distribuir a qualquer momento (inclusive no modo auto, onde o
 * overlay de carta fica suprimido pelo combate contínuo do piloto). Reusa allocateSkill/deallocateSkill.
 */
export function AttributesPanel({ onClose }: { onClose: () => void }) {
  const player = useGameStore(s => s.player);
  const allocateSkill = useGameStore(s => s.allocateSkill);
  const deallocateSkill = useGameStore(s => s.deallocateSkill);
  const attrs = effectiveAttributes(player);
  const own = player.attributes ?? DEFAULT_ATTRIBUTES;
  const points = player.skillPoints ?? 0;
  const xpPct = player.xpToNext > 0 ? Math.min(100, (player.xp / player.xpToNext) * 100) : 0;

  const distributeAll = () => {
    for (const a of autoDistribute({ ...DEFAULT_ATTRIBUTES, ...own }, points)) allocateSkill(a);
  };

  return (
    <div className="attrp">
      <div className="attrp-head">
        <div className="attrp-ident">
          <strong>{player.name} · {String(player.level).padStart(2, '0')}</strong>
          <div className="attrp-xp" title={`XP ${player.xp} / ${player.xpToNext}`}>
            <i style={{ width: `${xpPct}%` }} />
            <span>XP {player.xp.toLocaleString('pt-BR')} / {player.xpToNext.toLocaleString('pt-BR')} · {xpPct.toFixed(0)}%</span>
          </div>
        </div>
        <div className="attrp-points" data-has={points > 0 || undefined}>
          <Sparkles size={16} /><b>{points}</b><small>ponto{points === 1 ? '' : 's'}</small>
        </div>
      </div>

      <p className="attrp-hint">
        {points > 0
          ? 'Você tem pontos pra distribuir. Escolha onde colocar cada um — vale pra todos os níveis que você já pegou.'
          : 'Sem pontos no momento. Suba de nível pra ganhar mais pontos de atributo.'}
      </p>

      <div className="attrp-list">
        {ROWS.map(row => {
          const cur = own[row.key] ?? 0;
          return (
            <div className="attrp-row" key={row.key} title={ATTR_HINT[row.key]}>
              <div className="attrp-label"><span className="attrp-ic">{row.icon}</span>
                <div><strong>{ATTR_LABEL[row.key]}</strong><small>{ATTR_HINT[row.key]}</small></div>
              </div>
              <div className="attrp-bar"><i style={{ width: `${attrs[row.key]}%` }} /></div>
              <em className="attrp-val">+{attrs[row.key]}%</em>
              <div className="attrp-pm">
                <Button variant="ghost" className="attr-btn" aria-label={`Diminuir ${ATTR_LABEL[row.key]}`}
                  disabled={cur <= 0} onClick={() => deallocateSkill(row.key)}>−</Button>
                <Button variant="ghost" className="attr-btn" aria-label={`Aumentar ${ATTR_LABEL[row.key]}`}
                  disabled={points <= 0 || cur >= SKILL_CAP_PER_ATTR} onClick={() => allocateSkill(row.key)}>+</Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="attrp-actions">
        <Button variant="outline" disabled={points <= 0} onClick={distributeAll}><Wand2 />Distribuir tudo</Button>
        <Button onClick={onClose}>Fechar</Button>
      </div>
    </div>
  );
}
