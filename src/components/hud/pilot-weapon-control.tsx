import { Swords } from 'lucide-react';
import { useGameStore } from '@/game/state/game-store';
import type { PilotWeaponStyle } from '@/game/systems/weaponChoiceSystem';

/**
 * Seletor do estilo de arma que o piloto automático (modo idle) usa. Lê e escreve
 * direto no store (`pilotWeaponStyle` / `setPilotWeaponStyle`) — sem estado local —
 * para que o botão marcado reflita sempre o valor real que o piloto consulta.
 *
 * Fica na faixa do piloto (`.pilot-strip`) e segue o visual dos outros controles.
 */
const OPTIONS: ReadonlyArray<{ style: PilotWeaponStyle; label: string; hint: string }> = [
  { style: 'auto', label: 'Automático', hint: 'Piloto escolhe a arma pela distância do alvo' },
  { style: 'melee', label: 'Corpo a corpo', hint: 'Piloto prioriza armas corpo a corpo, aproximando do alvo' },
  { style: 'ranged', label: 'À distância', hint: 'Piloto prioriza arco/pistola/rifle, mesmo colado no alvo' },
];

export function PilotWeaponControl() {
  const pilotWeaponStyle = useGameStore(s => s.pilotWeaponStyle);
  const setPilotWeaponStyle = useGameStore(s => s.setPilotWeaponStyle);
  return (
    <div className="pilot-weapon" role="group" aria-label="Estilo de arma do piloto automático">
      <Swords aria-hidden="true" />
      {OPTIONS.map(opt => (
        <button
          key={opt.style}
          type="button"
          className="pilot-weapon-opt"
          data-active={pilotWeaponStyle === opt.style}
          aria-pressed={pilotWeaponStyle === opt.style}
          title={opt.hint}
          aria-label={opt.hint}
          onClick={() => setPilotWeaponStyle(opt.style)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
