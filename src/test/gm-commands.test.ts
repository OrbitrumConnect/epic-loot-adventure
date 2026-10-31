import { describe, it, expect } from 'vitest';
import { normalizeName, matchId, resolveCreatureId, resolveItemId, parseGmCommand } from '@/game/systems/gmCommands';

describe('normalizeName', () => {
  it('tira acento/caixa e junta separadores', () => {
    expect(normalizeName('Colosso dos Ancestrais')).toBe('colosso_dos_ancestrais');
    expect(normalizeName('colosso-dos-ancestrais')).toBe('colosso_dos_ancestrais');
    expect(normalizeName('  COLOSSO   DOS  ANCESTRAIS ')).toBe('colosso_dos_ancestrais');
    expect(normalizeName('Jacaré')).toBe('jacare');
  });
});

describe('matchId tolerante', () => {
  const entries = [{ id: 'raider_warlord', name: 'Colosso dos Ancestrais' }, { id: 'wolf_alpha', name: 'Leoa' }];
  it('casa por id, por nome, e com variações de digitação', () => {
    expect(matchId('raider_warlord', entries)).toBe('raider_warlord');
    expect(matchId('Colosso dos Ancestrais', entries)).toBe('raider_warlord');
    expect(matchId('colosso-dos-ancestrais', entries)).toBe('raider_warlord');
    expect(matchId('COLOSSODOSANCESTRAIS', entries)).toBe('raider_warlord'); // sem separador cai no prefixo/contém
    expect(matchId('leoa', entries)).toBe('wolf_alpha');
    expect(matchId('inexistente', entries)).toBeNull();
  });
});

describe('resolvers contra dados reais', () => {
  it('acha criatura e item conhecidos', () => {
    expect(resolveCreatureId('Colosso dos Ancestrais')).toBe('raider_warlord');
    expect(resolveItemId('Espada de Ferro')).toBe('iron_sword');
    expect(resolveItemId('espada-de-ferro')).toBe('iron_sword');
  });
});

describe('parseGmCommand', () => {
  it('separa comando e argumento; sem ! = null', () => {
    expect(parseGmCommand('!start')).toEqual({ cmd: 'start', arg: '' });
    expect(parseGmCommand('!goto Colosso dos Ancestrais')).toEqual({ cmd: 'goto', arg: 'Colosso dos Ancestrais' });
    expect(parseGmCommand('!ITEM espada de ferro')).toEqual({ cmd: 'item', arg: 'espada de ferro' });
    expect(parseGmCommand('oi')).toBeNull();
    expect(parseGmCommand('!')).toBeNull();
  });
});
