/**
 * SKINS DO HERÓI (03/11, Pedro: "o herói pôr no local do herói; opção pra escolher mulher ou homem — mulher soldada").
 * Personagens do Meshy com o MESMO esqueleto do herói de antes (no GLB vêm com outros nomes de osso — renomeados no
 * preparo, `mixamorig:*`), então as ~30 animações do herói servem nos dois. É só o visual: armas, atributos e
 * animações são os mesmos. O herói antigo (`red/hero-preview.glb`) fica no disco, sem uso.
 * Arquivo pequeno (sem 3D): a tela de escolha, o save e a rede importam sem carregar o mundo.
 */
export type HeroSkinId = 'homem' | 'mulher' | 'mercenario';

export type HeroSkin = {
  id: HeroSkinId;
  label: string;
  /** GLB do corpo (textura KTX2, como o herói de antes) */
  url: string;
  /** retrato pra tela de escolha (render do próprio modelo) */
  portrait: string;
  /** o esqueleto veio salvo noutra pose que a da pele (GLB do Meshy): anima a partir da pose de ligação */
  bindFix: boolean;
  /** ARMA NA MÃO (03/11, Pedro: "a arma ficou errada"): a mão desta skin tem outros eixos que a do herói de antes (onde a
   *  pega foi acertada). Rotação FIXA medida nos GLB reais (`arma-mao-skin.test.ts`: mesma em todas as poses) — o suporte
   *  da arma gira isto e ela fica como sempre. [x, y, z, w] */
  handFix: [number, number, number, number];
  /** CLAREAR (03/11, Pedro: "um pouco escuro, clarear 10–15%"): multiplica a cor (linear) — 1,28 ≈ +12% na tela */
  tone: number;
};

export const HERO_SKINS: Record<HeroSkinId, HeroSkin> = {
  homem: { id: 'homem', label: 'Homem', url: '/models/heroes/carioca.glb', portrait: '/models/heroes/carioca.webp', bindFix: true, handFix: [-0.009, -0.4379, 0.08, 0.8954], tone: 1.28 },
  mulher: { id: 'mulher', label: 'Mulher', url: '/models/heroes/soldier.glb', portrait: '/models/heroes/soldier.webp', bindFix: true, handFix: [-0.1218, -0.5224, 0.0968, 0.8384], tone: 1.28 },
  // 03/11 (Pedro: "mais 1 personagem pra escolher"): o mercenário do pack (export "animated_mixamo" — ossos já no padrão)
  mercenario: { id: 'mercenario', label: 'Mercenário', url: '/models/heroes/mercenario.glb', portrait: '/models/heroes/mercenario.webp', bindFix: true, handFix: [0.4619, 0.7754, 0.2012, -0.3808], tone: 1.28 },
};
export const HERO_SKIN_IDS: HeroSkinId[] = ['homem', 'mulher', 'mercenario'];
export const DEFAULT_HERO_SKIN: HeroSkinId = 'homem';

/** Qualquer valor (save antigo, rede, cliente velho) → uma skin válida; sem escolha = homem. */
export function heroSkinOf(v: unknown): HeroSkin {
  return HERO_SKINS[typeof v === 'string' && (HERO_SKIN_IDS as string[]).includes(v) ? (v as HeroSkinId) : DEFAULT_HERO_SKIN];
}
