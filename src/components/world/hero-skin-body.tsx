import { type ComponentProps, useEffect } from 'react';
import { GlbHeroMixamo } from './glb-hero-mixamo';
import { useHeroSkin } from './hero-skin';
import { setPoseSkin } from '@/net/multiplayer';

/**
 * CORPO do herói LOCAL pela skin escolhida (03/11: homem / mulher — `hero-skins.ts`). Usado no Vale, na Zona Sul e na
 * ficha do personagem: os 3 mostram a mesma skin. Só este pedaço re-renderiza ao trocar; a `key` remonta limpo (mixer e
 * medidas do modelo novo). Também avisa a rede (os outros jogadores desenham a mesma skin).
 */
export function LocalHeroBody(props: Omit<ComponentProps<typeof GlbHeroMixamo>, 'charUrl' | 'bindFix'> & { noNet?: boolean }) {
  const skin = useHeroSkin();
  const { noNet, ...rest } = props;
  useEffect(() => { if (!noNet) setPoseSkin(skin.id); }, [skin.id, noNet]);
  return <GlbHeroMixamo key={skin.id} charUrl={skin.url} bindFix={skin.bindFix} {...rest} />;
}
