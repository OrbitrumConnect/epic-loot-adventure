import { useEffect, useState } from 'react';
import {
  Axe, Crosshair, Flame, FlaskConical, Gem, Mountain, Package, Pickaxe, Shield,
  Skull, Sparkles, Swords, TreePine, Utensils,
} from 'lucide-react';
import { ITEMS, itemSpriteUrl } from '@/game/data/items';

/** Ícones próprios das armas de longe (lucide não tem arco/arma de fogo). */
function BowIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M7 3 C 14 8 14 16 7 21" />
      <path d="M7 3 L 7 21" />
      <path d="M4 12 H 19" />
      <polyline points="16 9 19 12 16 15" />
    </svg>
  );
}
function PistolIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" {...props}>
      <path d="M3 8 H16 V11 H12 L10 16 H7 V11 H3 Z" />
    </svg>
  );
}
function RifleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" {...props}>
      <path d="M2 9 H20 V11 H9 L8 15 H5 L6 11 H2 Z" />
    </svg>
  );
}

/** Ícones lucide de reserva, indexados por `Item.icon`. Usados quando o sprite não carrega. */
export const ICON_MAP: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  Swords, Axe, Pickaxe, FlaskConical, Crosshair, Utensils, Flame, Sparkles,
  TreePine, Mountain, Gem, Shield, Skull, Package,
  Bow: BowIcon, Pistol: PistolIcon, Rifle: RifleIcon,
};

/** Itens que não têm sprite webp: renderizam o ícone direto (sem 404). */
const NO_SPRITE = new Set(['bow', 'pistol', 'rifle', 'ancestral_blade', 'guardian_plate', 'eclipse_blade']);

export type ItemSpriteProps = {
  itemId: string | null | undefined;
  /** Lado em px (o sprite é quadrado). */
  size?: number;
  className?: string;
};

/**
 * Sprite de um item. Carrega a imagem de `itemSpriteUrl` (lazy) e, se falhar ou o
 * item não existir, desenha o ícone lucide do item (ou um pacote genérico).
 */
export function ItemSprite({ itemId, size = 32, className }: ItemSpriteProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [itemId]);
  const item = itemId ? ITEMS[itemId] : undefined;
  const cls = `item-sprite${className ? ` ${className}` : ''}`;

  // Itens sem arte webp (armas de longe): usa direto o ícone próprio.
  if (!itemId || !item || failed || NO_SPRITE.has(itemId)) {
    const Icon = (item && ICON_MAP[item.icon]) || Package;
    return <Icon className={`${cls} item-sprite-fallback`} width={size} height={size} aria-hidden="true" />;
  }
  return (
    <img
      className={cls}
      src={itemSpriteUrl(itemId)}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      draggable={false}
      alt=""
      aria-hidden="true"
      onError={() => setFailed(true)}
    />
  );
}
