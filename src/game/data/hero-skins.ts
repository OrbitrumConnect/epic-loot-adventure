/**
 * SKINS DO HERÓI (03/11, Pedro: "o herói pôr no local do herói; opção pra escolher mulher ou homem — mulher soldada").
 * Personagens do Meshy com o MESMO esqueleto do herói de antes (no GLB vêm com outros nomes de osso — renomeados no
 * preparo, `mixamorig:*`), então as ~30 animações do herói servem nos dois. É só o visual: armas, atributos e
 * animações são os mesmos. O herói antigo (`red/hero-preview.glb`) fica no disco, sem uso.
 * Arquivo pequeno (sem 3D): a tela de escolha, o save e a rede importam sem carregar o mundo.
 */
export type HeroSkinId = 'homem' | 'mulher';

export type HeroSkin = {
  id: HeroSkinId;
  label: string;
  /** GLB do corpo (textura KTX2, como o herói de antes) */
  url: string;
  /** retrato pra tela de escolha (render do próprio modelo) */
  portrait: string;
  /** o esqueleto veio salvo noutra pose que a da pele (GLB do Meshy): anima a partir da pose de ligação */
  bindFix: boolean;
};

export const HERO_SKINS: Record<HeroSkinId, HeroSkin> = {
  homem: { id: 'homem', label: 'Homem', url: '/models/heroes/carioca.glb', portrait: '/models/heroes/carioca.webp', bindFix: true },
  mulher: { id: 'mulher', label: 'Mulher', url: '/models/heroes/soldier.glb', portrait: '/models/heroes/soldier.webp', bindFix: true },
};
export const HERO_SKIN_IDS: HeroSkinId[] = ['homem', 'mulher'];
export const DEFAULT_HERO_SKIN: HeroSkinId = 'homem';

/** Qualquer valor (save antigo, rede, cliente velho) → uma skin válida; sem escolha = homem. */
export function heroSkinOf(v: unknown): HeroSkin {
  return HERO_SKINS[v === 'mulher' ? 'mulher' : DEFAULT_HERO_SKIN];
}
