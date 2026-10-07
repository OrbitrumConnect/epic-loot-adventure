import { Skull, Sparkles, TrendingUp } from 'lucide-react';
import { LEVEL_GAINS } from '@/game/systems/progressionSystem';
import type { FeedbackEvent, FeedbackKind } from '@/game/types/feedback';
import { ItemSprite } from './item-sprite';
import { useLiveFeedback } from './use-live-feedback';

const REWARD_KINDS: FeedbackKind[] = ['xp', 'loot', 'harvest', 'death', 'levelup'];
const MAX_CARDS = 7;

/** A animação dura o `ttl` do evento e já nasce adiantada pela idade dele, mesmo que o React demore. */
function cardStyle(e: FeedbackEvent): React.CSSProperties {
  const age = Math.max(0, Date.now() - e.createdAt);
  return { animationDuration: `${e.ttl}ms`, animationDelay: `${-age}ms` };
}

function cardLabel(e: FeedbackEvent): string {
  if (e.kind === 'xp') return `+${e.amount} XP`;
  if (e.kind === 'levelup') return `Nível ${e.amount}!`;
  return e.label;
}

/**
 * Pilha de cartas de recompensa no centro-inferior do mundo (acima da hotbar).
 * Mais novo embaixo; as antigas saem por cima sem empurrar as de baixo.
 */
export function RewardFeed() {
  const events = useLiveFeedback(REWARD_KINDS, MAX_CARDS);
  return (
    <div className="reward-feed" role="log" aria-live="polite" aria-label="Recompensas recebidas" title="Recompensas recebidas">
      {events.map(e => (
        <div key={e.id} className="reward-card" data-kind={e.kind} style={cardStyle(e)} title={cardLabel(e)}>
          <span className="reward-icon">
            {(e.kind === 'loot' || e.kind === 'harvest') && <ItemSprite itemId={e.itemId} size={30} />}
            {e.kind === 'xp' && <Sparkles aria-hidden="true" />}
            {e.kind === 'death' && <Skull aria-hidden="true" />}
            {e.kind === 'levelup' && <TrendingUp aria-hidden="true" />}
          </span>
          <strong>{cardLabel(e)}</strong>
        </div>
      ))}
    </div>
  );
}

/** Faixa de subida de nível: nome do nível e o que o personagem ganhou. */
export function LevelUpBanner() {
  const events = useLiveFeedback(['levelup'], 1);
  const e = events[events.length - 1];
  if (!e) return null;
  return (
    <div key={e.id} className="levelup-banner" role="status" aria-live="assertive"
      title={`Nível ${e.amount} alcançado`} aria-label={`Nível ${e.amount} alcançado`} style={cardStyle(e)}>
      <small>VOCÊ EVOLUIU</small>
      <h2>Nível {e.amount}</h2>
      <p>
        <span>+{LEVEL_GAINS.maxHp} Vida</span>
        <span>+{LEVEL_GAINS.maxMana} Mana</span>
        <span>+{LEVEL_GAINS.maxStamina} Vigor</span>
        <span>+{LEVEL_GAINS.attackPower} Ataque</span>
      </p>
    </div>
  );
}
