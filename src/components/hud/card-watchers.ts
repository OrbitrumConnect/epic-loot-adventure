/**
 * Vigias que transformam eventos que JÁ acontecem em cartas (Pedro 25/10): pontos de atributo, poder novo liberado,
 * prédio da cidade pronto, casa de pedra/metal liberada, acampamento limpo. Só reagem a MUDANÇAS — o estado que já
 * existe ao carregar não vira carta (exceto pontos de atributo guardados, que viram a carta de escolha).
 */
import { useEffect } from 'react';
import { useGameStore } from '@/game/state/game-store';
import { HERO_POWER_UNLOCK } from '@/game/systems/heroPowersSystem';
import { BUILDINGS } from '@/game/data/buildings';
import { pushCard } from './card-queue';
import { restoredRecently } from '@/game/state/restore-marker';

/** Poderes que liberam por nível: nome + tecla (pra carta ensinar o controle). */
export const POWER_CARDS: { level: number; name: string; key: string }[] = [
  { level: 5, name: 'Chuva de Flechas', key: 'F' },
  { level: HERO_POWER_UNLOCK.boomerang, name: 'Bumerangue', key: 'Z' },
  { level: HERO_POWER_UNLOCK.tornado, name: 'Furacão', key: 'X' },
  { level: HERO_POWER_UNLOCK.lightning, name: 'Raio', key: 'C' },
];

/** Poderes liberados ao passar de `from` para `to` (puro, testável). */
export function powersUnlocked(from: number, to: number) {
  return POWER_CARDS.filter((p) => p.level > from && p.level <= to);
}

export function useCardWatchers(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let prev = useGameStore.getState();
    const levels = (s: typeof prev) => new Map(s.base.buildings.map((b) => [b.id, b.level]));
    let prevLevels = levels(prev);
    const levelCard = () => pushCard({ kind: 'level', icon: '✦', title: 'Pontos de atributo', sticky: true }, true);
    if ((prev.player.skillPoints ?? 0) > 0) levelCard();

    return useGameStore.subscribe((s) => {
      const p = prev;
      prev = s;
      // Save acabou de carregar: tudo "muda de uma vez" — só atualiza a referência, sem carta falsa.
      if (restoredRecently()) { prevLevels = levels(s); if ((s.player.skillPoints ?? 0) > 0) levelCard(); return; }
      // Nível subiu → poder novo (ensina a tecla) + carta de atributo.
      if (s.player.level > p.player.level) {
        for (const pw of powersUnlocked(p.player.level, s.player.level)) {
          pushCard({ kind: 'power', icon: '⚡', title: `Novo poder: ${pw.name}`, body: `Tecla ${pw.key} · no celular, o botão do poder no rodapé.` });
        }
      }
      if ((s.player.skillPoints ?? 0) > 0 && (s.player.skillPoints ?? 0) !== (p.player.skillPoints ?? 0)) levelCard();
      // Prédio da cidade terminou (não precisa ir à cidade ver).
      if (s.base.buildings !== p.base.buildings) {
        const now = levels(s);
        for (const [id, lv] of now) {
          const before = prevLevels.get(id);
          if (before !== undefined && lv > before) {
            const b = s.base.buildings.find((x) => x.id === id);
            if (b) pushCard({ kind: 'building', icon: '🏗', title: `${BUILDINGS[b.defId].name} nível ${lv} pronto`, body: 'Produção e bônus já valendo.' });
          }
        }
        prevLevels = now;
      }
      // Casa evoluiu.
      if (s.baseEvolved && !p.baseEvolved) pushCard({ kind: 'house', icon: '🏠', title: 'Casa de PEDRA liberada', body: 'Mais vida e 2º andar. Muros e torres agora em pedra.' });
      if (s.baseMetal && !p.baseMetal) pushCard({ kind: 'house', icon: '🏠', title: 'Casa de METAL liberada', body: 'O nível mais forte da base. Muros e torres agora em metal.' });
      // Acampamento limpo.
      if (s.camps !== p.camps) {
        for (const c of s.camps) {
          const before = p.camps.find((x) => x.id === c.id);
          if (c.cleared && before && !before.cleared) pushCard({ kind: 'camp', icon: '🏕', title: `Acampamento limpo!`, body: 'Recompensa entregue na bolsa (o que coube).' });
        }
      }
    });
  }, [enabled]);
}
