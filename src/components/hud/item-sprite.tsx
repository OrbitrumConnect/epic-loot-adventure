import { useEffect, useState } from 'react';
import {
  Axe, Crosshair, Flame, FlaskConical, Gem, Mountain, Package, Pickaxe, Shield,
  Skull, Sparkles, Swords, TreePine, Utensils,
} from 'lucide-react';
import { ITEMS, itemSpriteUrl } from '@/game/data/items';

/** Ícones lucide de reserva, indexados por `Item.icon`. Usados quando o sprite não carrega. */
export const ICON_MAP: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  Swords, Axe, Pickaxe, FlaskConical, Crosshair, Utensils, Flame, Sparkles,
  TreePine, Mountain, Gem, Shield, Skull, Package,
};

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

  if (!itemId || !item || failed) {
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
