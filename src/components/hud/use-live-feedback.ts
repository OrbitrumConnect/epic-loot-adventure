import { useEffect, useState } from 'react';
import { useGameStore } from '@/game/state/game-store';
import type { FeedbackEvent, FeedbackKind } from '@/game/types/feedback';

const alive = (e: FeedbackEvent, now: number) => now - e.createdAt < e.ttl;

/**
 * Eventos de feedback vivos de certos tipos, para o HUD.
 *
 * Não assina o store pelo React (o store muda várias vezes por segundo por causa do mundo):
 * um `subscribe` imperativo compara a referência de `feedback` e só chama `setState` quando
 * chega um evento NOVO dos tipos pedidos. A expiração usa `createdAt + ttl` do próprio evento,
 * com um único timeout para o próximo vencimento, sem relógio paralelo.
 */
export function useLiveFeedback(kinds: readonly FeedbackKind[], max: number): FeedbackEvent[] {
  const [list, setList] = useState<FeedbackEvent[]>(() => {
    const now = Date.now();
    return useGameStore.getState().feedback.filter(e => kinds.includes(e.kind) && alive(e, now)).slice(-max);
  });

  useEffect(() => {
    let lastFeedback = useGameStore.getState().feedback;
    let lastId = lastFeedback.reduce((m, e) => Math.max(m, e.id), 0);
    return useGameStore.subscribe(state => {
      if (state.feedback === lastFeedback) return;
      lastFeedback = state.feedback;
      const now = Date.now();
      const fresh = state.feedback.filter(e => e.id > lastId && kinds.includes(e.kind) && alive(e, now));
      lastId = state.feedback.reduce((m, e) => Math.max(m, e.id), lastId);
      if (fresh.length === 0) return;
      setList(prev => [...prev.filter(e => alive(e, now)), ...fresh].slice(-max));
    });
    // `kinds` é uma constante do chamador; só `max` importa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [max]);

  useEffect(() => {
    if (list.length === 0) return undefined;
    const now = Date.now();
    const next = Math.min(...list.map(e => e.createdAt + e.ttl));
    const id = setTimeout(() => {
      const t = Date.now();
      setList(prev => {
        const kept = prev.filter(e => alive(e, t));
        return kept.length === prev.length ? prev : kept;
      });
    }, Math.max(30, next - now + 20));
    return () => clearTimeout(id);
  }, [list]);

  return list;
}
