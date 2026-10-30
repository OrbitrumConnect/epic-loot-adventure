import { useEffect, useState } from 'react';
import {
  ArrowUpRight, Axe, Crosshair, Flame, FlaskConical, Gem, Mountain, Package, Pickaxe, Shield,
  Skull, Sparkles, Swords, Target, TreePine, Utensils,
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

/** Prancha de surf (Zona Sul): deck creme, longarina laranja, quilha azul — inclinada como no hotbar. */
function SurfboardIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <g transform="rotate(-35 12 12)">
        <ellipse cx="12" cy="12" rx="3.6" ry="10.5" fill="#f4efe2" stroke="#1b4c63" strokeWidth="1.2" />
        <line x1="12" y1="2.2" x2="12" y2="21.8" stroke="#e0672f" strokeWidth="1.1" />
        <path d="M10.6 19.5 L12 22.3 L13.4 19.5 Z" fill="#1b4c63" />
      </g>
    </svg>
  );
}

/** Asa-delta: a vela em triângulo e o trapézio embaixo. */
function GliderIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path d="M2 11 L12 4 L22 11 L12 9 Z" fill="#e0672f" stroke="#1b4c63" strokeWidth="1" strokeLinejoin="round" />
      <path d="M12 9 L9 17 L15 17 Z" fill="none" stroke="#cfd6dc" strokeWidth="1.2" />
      <circle cx="12" cy="19" r="1.6" fill="#f4efe2" />
    </svg>
  );
}
/** Skate voador: o deck com dois "pés" de levitação brilhando. */
function HoverboardIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <rect x="3" y="9" width="18" height="4" rx="2" fill="#e8ecef" stroke="#1b4c63" strokeWidth="1" />
      <ellipse cx="7.5" cy="15.5" rx="2.6" ry="1.3" fill="#3fb8ff" opacity="0.85" />
      <ellipse cx="16.5" cy="15.5" rx="2.6" ry="1.3" fill="#3fb8ff" opacity="0.85" />
    </svg>
  );
}

/** Ícones lucide de reserva, indexados por `Item.icon`. Usados quando o sprite não carrega. */
export const ICON_MAP: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  Swords, Axe, Pickaxe, FlaskConical, Crosshair, Utensils, Flame, Sparkles,
  TreePine, Mountain, Gem, Shield, Skull, Package, ArrowUpRight, Target,
  Bow: BowIcon, Pistol: PistolIcon, Rifle: RifleIcon, Surfboard: SurfboardIcon, Glider: GliderIcon, Hoverboard: HoverboardIcon,
};

/** Itens que não têm sprite webp: renderizam o ícone direto (sem 404). */
const NO_SPRITE = new Set(['ammo', 'bow', 'pistol', 'rifle', 'ancestral_blade', 'guardian_plate', 'eclipse_blade', 'arrow', 'hunter_bow', 'bone_armor', 'surfboard', 'hang_glider', 'hover_skate']);

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
