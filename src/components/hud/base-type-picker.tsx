import { useGameStore } from '@/game/state/game-store';
import { BASE_TYPES } from '@/game/data/base-types';
import type { BaseType } from '@/game/types/playerbase';
import { useId } from 'react';

const TYPES: BaseType[] = ['fortress', 'watchpost', 'workshop'];

/** Visível no painel e ao escolher terreno (inclusive entrada pelo atalho). */
export function BaseTypePicker() {
  const group = useId();
  const selected = useGameStore(s => s.selectedBaseType);
  const select = useGameStore(s => s.selectBaseType);
  return (
    <fieldset className="grid gap-2 text-sm" aria-label="Tipo de base">
      <legend className="mb-2 font-semibold">Escolha o tipo antes de reivindicar</legend>
      <div className="flex flex-wrap gap-2">
        {TYPES.map(type => (
          <label key={type} className="flex cursor-pointer items-center gap-1.5 rounded border border-border px-2 py-1.5">
            <input type="radio" name={group} value={type} checked={selected === type} onChange={() => select(type)} />
            {BASE_TYPES[type].name}
          </label>
        ))}
      </div>
      <p role="status">{BASE_TYPES[selected].description} A escolha fica fixa após reivindicar.</p>
    </fieldset>
  );
}
