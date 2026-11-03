import { useGameStore } from '@/game/state/game-store';
import { type HeroSkin, heroSkinOf } from '@/game/data/hero-skins';

/** Skin do herói LOCAL (03/11). Só re-renderiza quem usa quando a skin troca (o objeto da skin é constante). */
export function useHeroSkin(): HeroSkin {
  return useGameStore((s) => heroSkinOf(s.player.skin));
}
