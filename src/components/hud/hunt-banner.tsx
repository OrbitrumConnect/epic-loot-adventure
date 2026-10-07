import { Crosshair, Tent } from 'lucide-react';
import { useGameStore } from '@/game/state/game-store';
import { CREATURES } from '@/game/data/creatures';
import type { CampState, CreatureState } from '@/game/types';

/**
 * Retrato de espécie. Não há sprite de criatura: o retrato é um chip colorido com a
 * sigla da espécie. Cor fixa por espécie (tokens --world-*); hostil = chip hexagonal,
 * pacífica = redondo. Espécie desconhecida cai numa cor derivada do id, sempre a mesma.
 */
const SPECIES_CHIP: Record<string, { code: string; color: string }> = {
  wolf: { code: 'Lo', color: '--world-rock-light' },
  wolf_alpha: { code: 'LA', color: '--world-gold' },
  raider_scout: { code: 'Sb', color: '--world-cloak' },
  raider_warrior: { code: 'Sg', color: '--world-armor' },
  raider_brute: { code: 'Sm', color: '--world-trunk' },
  raider_shaman: { code: 'Sx', color: '--world-crystal' },
  rabbit: { code: 'Co', color: '--world-light' },
  deer: { code: 'Ce', color: '--world-leaf-light' },
  boar: { code: 'Jv', color: '--world-path' },
  bear: { code: 'Ur', color: '--world-leaf' },
};
const FALLBACK_COLORS = ['--world-rock-light', '--world-cloak', '--world-leaf-light', '--world-gold', '--world-crystal'];

function chipFor(speciesId: string, name: string) {
  const known = SPECIES_CHIP[speciesId];
  if (known) return known;
  let h = 0;
  for (const ch of speciesId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { code: (name.trim()[0] ?? '?').toUpperCase(), color: FALLBACK_COLORS[h % FALLBACK_COLORS.length]! };
}

export function SpeciesPortrait({ speciesId, name }: { speciesId: string; name: string }) {
  const chip = chipFor(speciesId, name);
  const peaceful = CREATURES[speciesId]?.peaceful ?? false;
  return (
    <span className="species-portrait" data-shape={peaceful ? 'round' : 'hex'} aria-hidden="true"
      style={{ ['--chip' as string]: `var(${chip.color})` }}>
      {chip.code}
    </span>
  );
}

type Focus =
  | { type: 'creature'; id: string; speciesId: string; name: string; hp: number; max: number }
  | { type: 'camp'; id: string; name: string; hp: number; max: number; left: number };

const isAlive = (c: CreatureState) => c.behavior !== 'dead' && c.behavior !== 'respawning';

/**
 * Serializa o alvo atual numa string: o seletor devolve primitivo, então o banner só
 * re-renderiza quando algo que ele mostra muda (vida, nome, alvo), não a cada tick do mundo.
 */
function focusKey(s: ReturnType<typeof useGameStore.getState>): string {
  const byId = (id: string | null) => (id ? s.creatures.find(c => c.id === id) : undefined);
  const creatureKey = (c: CreatureState) =>
    `c|${c.id}|${c.speciesId}|${c.name}|${Math.max(0, Math.round(c.hp))}|${c.maxHp}`;
  const sel = byId(s.targetId);
  if (sel && isAlive(sel)) return creatureKey(sel);
  const obj = s.objectives.items.find(o => o.status === 'active');
  if (obj?.kind === 'hunt_creature') {
    const c = byId(obj.targetId);
    if (c && isAlive(c)) return creatureKey(c);
  }
  if (obj?.kind === 'clear_camp') {
    const camp = (s.camps as CampState[]).find(k => k.id === obj.targetId);
    if (camp && !camp.cleared) {
      let hp = 0, max = 0, left = 0;
      for (const id of camp.creatureIds) {
        const c = byId(id);
        if (!c) continue;
        max += c.maxHp;
        if (isAlive(c)) { hp += Math.max(0, c.hp); left += 1; }
      }
      return `k|${camp.id}|${camp.discovered ? camp.name : 'Acampamento inimigo'}|${Math.round(hp)}|${max}|${left}`;
    }
  }
  return '';
}

function parse(key: string): Focus | null {
  if (!key) return null;
  const p = key.split('|');
  if (p[0] === 'c') return { type: 'creature', id: p[1]!, speciesId: p[2]!, name: p[3]!, hp: Number(p[4]), max: Number(p[5]) };
  return { type: 'camp', id: p[1]!, name: p[2]!, hp: Number(p[3]), max: Number(p[4]), left: Number(p[5]) };
}

/** Banner compacto do alvo de caça: retrato, nome e barra de vida. */
export function HuntBanner() {
  const key = useGameStore(focusKey);
  const f = parse(key);
  if (!f) return null;
  const pct = f.max > 0 ? Math.max(0, Math.min(100, (f.hp / f.max) * 100)) : 0;
  const label = f.type === 'creature'
    ? `Alvo: ${f.name}, ${f.hp} de ${f.max} de vida`
    : `Limpando ${f.name}: ${f.left} inimigos restantes`;
  return (
    <div className="hunt-banner" role="status" aria-label={label} title={label} data-kind={f.type}>
      {f.type === 'creature'
        ? <SpeciesPortrait speciesId={f.speciesId} name={f.name} />
        : <span className="species-portrait" data-shape="hex" aria-hidden="true" style={{ ['--chip' as string]: 'var(--world-cloak)' }}><Tent /></span>}
      <div className="hunt-banner-body">
        <small><Crosshair aria-hidden="true" />{f.type === 'creature' ? 'CAÇANDO' : 'LIMPANDO ACAMPAMENTO'}</small>
        <strong>{f.name}</strong>
        <div className="hunt-hp" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
      </div>
      <span className="hunt-hp-text">{f.type === 'creature' ? `${f.hp}/${f.max}` : `${f.left} vivos`}</span>
    </div>
  );
}
