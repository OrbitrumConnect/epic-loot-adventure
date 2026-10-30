import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bird, Bot, Footprints, PawPrint, Rabbit, Skull,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGameStore } from '@/game/state/game-store';
import { setAutoMode } from '@/components/world/objective-bridge';
import { CREATURES } from '@/game/data/creatures';
import { ITEMS } from '@/game/data/items';
import { creatureLevel, creatureXp } from '@/game/systems/progressionSystem';
import { computeZsZones, type ZsZone } from '@/game/data/zs-zones';
import { HUNT_AREA_RADIUS } from '@/game/systems/objectiveSystem';
import { ZS_TERRAIN } from '@/components/zona-sul/zona-sul-meta';
import { ItemSprite } from '@/components/hud/item-sprite';

/**
 * TELA DE MAPA da Zona Sul. Fundo = terrain.png; por cima, o herói e as 5 zonas de fauna
 * (computeZsZones). O painel ao lado (desktop) / embaixo (celular) lista as zonas e mostra a ficha
 * dos bichos (ícone/nome/nível/XP/loot) da zona escolhida. "Farmar" manda o piloto automático até o
 * centro da zona, caçando no raio dela. TUDO cabe sem rolagem da página (layout em grade, altura
 * limitada; a ficha da zona tem rolagem interna só se a fauna não couber).
 *
 * Custo de re-render: NÃO assina o store (como o WorldMap). Lê `getState()` ao abrir e recomputa as
 * zonas a cada 2 s; o herói anda por atualização imperativa de estilo (400 ms), sem re-render.
 */

// Limites do mundo cobertos pelo terrain.png, derivados de ZS_TERRAIN (x = leste, z = SUL).
const SPAN_X = (ZS_TERRAIN.w - 1) * ZS_TERRAIN.cell; // 1596
const SPAN_Z = (ZS_TERRAIN.h - 1) * ZS_TERRAIN.cell; // 1052
export const ZS_MAP_BOUNDS = {
  minX: (0.5 - ZS_TERRAIN.w / 2) * ZS_TERRAIN.cell,
  maxX: (0.5 - ZS_TERRAIN.w / 2) * ZS_TERRAIN.cell + SPAN_X,
  minZ: (0.5 - ZS_TERRAIN.h / 2) * ZS_TERRAIN.cell,
  maxZ: (0.5 - ZS_TERRAIN.h / 2) * ZS_TERRAIN.cell + SPAN_Z,
} as const;

/** Mundo (x, z) → fração [0,1] sobre o fundo (0 = oeste/norte, 1 = leste/sul). Pura (testável). */
export function zsWorldToPct(x: number, z: number): { left: number; top: number } {
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  return {
    left: clamp01((x - ZS_MAP_BOUNDS.minX) / SPAN_X) * 100,
    top: clamp01((z - ZS_MAP_BOUNDS.minZ) / SPAN_Z) * 100,
  };
}

/** Raio (m) da zona → semieixos em % do fundo (elipse, porque X e Z têm escalas diferentes). */
export function zsRadiusToPct(radius: number): { rx: number; ry: number } {
  return { rx: (radius / SPAN_X) * 100, ry: (radius / SPAN_Z) * 100 };
}

/**
 * Manda o piloto automático farmar a zona: cria uma área de caça no CENTRO com o RAIO da zona
 * (com folga, mínimo HUNT_AREA_RADIUS) e liga o modo idle. Pura em relação ao React (só store).
 */
export function farmZsZone(zone: ZsZone): void {
  const radius = Math.max(HUNT_AREA_RADIUS, Math.round(zone.radius) + 8);
  useGameStore.getState().addHuntArea(zone.center.x, zone.center.z, radius);
  setAutoMode('idle');
}

/** Ícone lucide da espécie (CREATURES[id].icon). Fallback: caveira. */
const CREATURE_ICON: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  PawPrint, Bird, Skull, Footprints, Rabbit,
};
function creatureIcon(iconName: string | undefined) {
  return CREATURE_ICON[iconName ?? ''] ?? Skull;
}

/** Espécies com sprite própria (render do modelo do jogo, recortado) em public/assets/creatures/<id>.webp. */
const CREATURE_SPRITE = new Set(['boar', 'goose', 'wolf_alpha', 'bear', 'deer', 'rabbit', 'pheasant', 'pigeon', 'monster', 'flintmaw']);

/** Carinha do bicho: a sprite real (modelo do jogo); se faltar/falhar, cai no ícone Lucide. */
function CreatureFace({ speciesId, iconName, peaceful }: { speciesId: string; iconName: string | undefined; peaceful?: boolean }) {
  const [useSprite, setUseSprite] = useState(CREATURE_SPRITE.has(speciesId));
  const Icon = creatureIcon(iconName);
  return (
    <span className="zs-species-icon" data-peaceful={peaceful || undefined} data-sprite={useSprite || undefined}>
      {useSprite
        ? <img src={`/assets/creatures/${speciesId}.webp`} alt="" draggable={false} onError={() => setUseSprite(false)} />
        : <Icon strokeWidth={1.8} />}
    </span>
  );
}

export type ZsMapProps = { onClose: () => void };

export function ZsMap({ onClose }: ZsMapProps) {
  const [zones, setZones] = useState<ZsZone[]>(() => computeZsZones(useGameStore.getState().creatures));
  // Começa com a 1ª zona aberta: o card já aparece junto do mapa (nada escondido atrás de clique).
  const [selectedId, setSelectedId] = useState<string | null>(() => zones[0]?.id ?? null);
  const heroRef = useRef<HTMLDivElement>(null);

  // Recomputa as zonas a cada 2 s (criaturas morrem/renascem) — só re-renderiza se a contagem
  // por zona mudou, pra não repintar à toa. Barato: 5 zonas.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.hidden) return;
      const next = computeZsZones(useGameStore.getState().creatures);
      setZones(prev => {
        if (prev.length === next.length
          && prev.every((z, i) => z.id === next[i]!.id && z.creatureCount === next[i]!.creatureCount)) {
          return prev;
        }
        return next;
      });
    }, 2000);
    return () => window.clearInterval(id);
  }, []);

  // Herói: posição por atualização imperativa de estilo (sem re-render). 400 ms basta no mapa.
  useEffect(() => {
    const place = () => {
      const el = heroRef.current;
      if (!el || document.hidden) return;
      const p = useGameStore.getState().player.position;
      const { left, top } = zsWorldToPct(p.x, p.z);
      el.style.left = `${left}%`;
      el.style.top = `${top}%`;
    };
    place();
    const id = window.setInterval(place, 400);
    return () => window.clearInterval(id);
  }, []);

  // A zona escolhida saiu da lista (toda a fauna morreu)? Cai na primeira disponível.
  useEffect(() => {
    if (selectedId && !zones.some(z => z.id === selectedId)) {
      setSelectedId(zones[0]?.id ?? null);
    }
  }, [zones, selectedId]);

  const selected = useMemo(
    () => zones.find(z => z.id === selectedId) ?? null,
    [zones, selectedId],
  );

  const onFarm = (zone: ZsZone) => {
    farmZsZone(zone);
    onClose();
  };

  return (
    <div className="zs-map-wrap">
      {/* MAPA */}
      <div className="zs-map-col">
        <div className="zs-map" role="application" aria-label="Mapa da Zona Sul do Rio. Escolha uma zona para ver os bichos.">
          <img className="zs-map-bg" src={ZS_TERRAIN.url} alt="Relevo da Zona Sul do Rio de Janeiro" draggable={false} />
          {zones.map(zone => {
            const { left, top } = zsWorldToPct(zone.center.x, zone.center.z);
            const { rx, ry } = zsRadiusToPct(zone.radius);
            const active = zone.id === selectedId;
            const Icon = creatureIcon(CREATURES[zone.speciesIds[0] ?? '']?.icon);
            return (
              <button
                key={zone.id}
                type="button"
                className="zs-zone"
                data-active={active || undefined}
                style={{ left: `${left}%`, top: `${top}%`, ['--rx' as string]: `${rx}%`, ['--ry' as string]: `${ry}%` }}
                title={`${zone.name} · nível ${zone.levelMin}–${zone.levelMax} · ${zone.creatureCount} bichos`}
                aria-label={`${zone.name}, nível ${zone.levelMin} a ${zone.levelMax}, ${zone.creatureCount} criaturas.`}
                aria-pressed={active}
                onClick={() => setSelectedId(zone.id)}
              >
                <span className="zs-zone-ring" aria-hidden="true" />
                <span className="zs-zone-pin"><Icon strokeWidth={1.8} /></span>
                {active && <span className="zs-zone-tag">{zone.name}</span>}
              </button>
            );
          })}
          <div ref={heroRef} className="zs-hero" aria-label="Você" title="Você" />
        </div>
        <div className="zs-map-legend">
          <span><i className="zs-key zs-key-hero" />Você</span>
          <span><i className="zs-key zs-key-zone" />Zona de fauna (clique)</span>
        </div>
      </div>

      {/* PAINEL DA ZONA */}
      <div className="zs-map-side">
        <div className="zs-zone-tabs" role="tablist" aria-label="Zonas de fauna">
          {zones.length === 0 && <p className="zs-map-hint">Nenhuma fauna detectada no mapa ainda.</p>}
          {zones.map(zone => (
            <button
              key={zone.id}
              type="button"
              role="tab"
              className="zs-zone-tab"
              data-active={zone.id === selectedId || undefined}
              aria-selected={zone.id === selectedId}
              title={`${zone.name} · nível ${zone.levelMin}–${zone.levelMax}`}
              onClick={() => setSelectedId(zone.id)}
            >
              <strong>{zone.name}</strong>
              <small>Nv {zone.levelMin}–{zone.levelMax}</small>
            </button>
          ))}
        </div>

        {selected && (
          <div className="zs-zone-card">
            <div className="zs-card-head">
              <small>Nível {selected.levelMin}–{selected.levelMax} · {selected.creatureCount} bichos</small>
              <h3>{selected.name}</h3>
              <p>{selected.description}</p>
            </div>
            <div className="zs-species-list">
              {selected.speciesIds.map(id => {
                const def = CREATURES[id];
                if (!def) return null;
                const peaceful = def.peaceful;
                const loot = def.lootTable.slice().sort((a, b) => b.chance - a.chance);
                return (
                  <div className="zs-species" key={id}>
                    <div className="zs-species-head">
                      <CreatureFace speciesId={id} iconName={def.icon} peaceful={peaceful} />
                      <div className="zs-species-id">
                        <strong>{def.name}</strong>
                        <small>Nv {creatureLevel(def)} · {creatureXp(def)} XP · {peaceful ? 'pacífico' : 'hostil'}</small>
                      </div>
                    </div>
                    {loot.length > 0 && (
                      <div className="zs-loot" aria-label="Loot">
                        {loot.map(drop => (
                          <span className="zs-loot-item" key={drop.itemId}
                            title={`${ITEMS[drop.itemId]?.name ?? drop.itemId} · ${Math.round(drop.chance * 100)}% de chance`}>
                            <ItemSprite itemId={drop.itemId} size={16} />
                            <b>{Math.round(drop.chance * 100)}%</b>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="zs-card-actions">
              <Button onClick={() => onFarm(selected)} title={`Mandar o piloto caçar em ${selected.name}`}>
                <Bot />Farmar esta zona
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
