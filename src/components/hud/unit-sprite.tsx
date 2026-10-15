import { useEffect, useState } from 'react';
import { Swords } from 'lucide-react';
import { UNITS } from '@/game/data/units';

export type UnitSpriteProps = {
  unitId: string | null | undefined;
  /** Lado em px (o sprite é quadrado). */
  size?: number;
  className?: string;
};

/** Sprite da tropa (`UNITS[id].sprite`). Sem sprite ou com falha: ícone genérico. */
export function UnitSprite({ unitId, size = 28, className }: UnitSpriteProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [unitId]);
  const sprite = unitId ? UNITS[unitId]?.sprite : undefined;
  const cls = `unit-sprite${className ? ` ${className}` : ''}`;
  if (!sprite || failed) {
    return <Swords className={`${cls} unit-sprite-fallback`} width={size} height={size} aria-hidden="true" />;
  }
  return (
    <img className={cls} src={sprite} width={size} height={size} loading="lazy" decoding="async"
      draggable={false} alt="" aria-hidden="true" onError={() => setFailed(true)} />
  );
}
