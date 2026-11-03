import { useEffect, useState } from 'react';
import { useGameStore } from '@/game/state/game-store';
import { accountLoad } from '@/game/state/account-persistence';
import { HERO_SKIN_IDS, HERO_SKINS, type HeroSkinId } from '@/game/data/hero-skins';

/** Grava a skin no personagem (vai no save da conta e na pose pra rede). */
export function chooseHeroSkin(id: HeroSkinId): void {
  useGameStore.setState((s) => ({ player: { ...s.player, skin: id } }));
}

/**
 * ESCOLHA DO SOBREVIVENTE (03/11, Pedro: "logou, escolhe o herói ou a mulher — mulher soldada"). Aparece UMA vez, ao
 * entrar, pra quem ainda não escolheu (conta nova ou save de antes de 03/11) — e só depois que o save da conta chegou
 * (senão piscaria pra quem já escolheu noutro aparelho). Dá pra trocar depois na ficha do personagem.
 */
export function HeroSkinPicker({ waitAccount }: { waitAccount: boolean }) {
  const skin = useGameStore((s) => s.player.skin);
  const [ready, setReady] = useState(() => !waitAccount || accountLoad.decided);
  useEffect(() => {
    if (ready) return undefined;
    const t = window.setInterval(() => { if (accountLoad.decided) setReady(true); }, 300);
    return () => window.clearInterval(t);
  }, [ready]);
  if (!ready || skin) return null;
  return (
    <div className="skin-pick" role="dialog" aria-modal="true" aria-labelledby="skin-pick-title">
      <div className="skin-pick__box">
        <h2 id="skin-pick-title">Escolha seu sobrevivente</h2>
        <p>Só muda o visual — armas, atributos e animações são os mesmos. Dá pra trocar depois na ficha do personagem.</p>
        <div className="skin-pick__row">
          {HERO_SKIN_IDS.map((id) => (
            <button key={id} type="button" className="skin-pick__card" onClick={() => chooseHeroSkin(id)}>
              <img src={HERO_SKINS[id].portrait} alt="" width={160} height={240} loading="eager" />
              <strong>{HERO_SKINS[id].label}</strong>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Trocar na FICHA do personagem (o boneco 3D do lado já mostra a escolhida). */
export function HeroSkinToggle() {
  const skin = useGameStore((s) => s.player.skin ?? 'homem');
  return (
    <div className="cs-skin" role="radiogroup" aria-label="Sobrevivente">
      {HERO_SKIN_IDS.map((id) => (
        <button key={id} type="button" role="radio" aria-checked={skin === id} data-on={skin === id || undefined} onClick={() => chooseHeroSkin(id)}>
          {HERO_SKINS[id].label}
        </button>
      ))}
    </div>
  );
}
