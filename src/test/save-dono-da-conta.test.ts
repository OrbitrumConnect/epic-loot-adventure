import { describe, expect, it } from 'vitest';
import { accountLoginAction } from '@/game/state/account-persistence';

/* 22/10: trocar de conta no MESMO aparelho levava o personagem da conta anterior (conta nova
   nasceu nível 30; conta com menos XP foi sobrescrita). Agora o local só vence se for DESTA conta. */
describe('save da conta × dono do personagem local', () => {
  const A = 'conta-a', B = 'conta-b';

  it('conta nova + personagem de OUTRA conta na memória → nasce personagem novo', () => {
    expect(accountLoginAction({ userId: B, owner: A, cloudXp: null, localXp: 18270 })).toBe('fresh');
  });
  it('conta nova + aparelho sem dono conhecido → personagem novo (não herda)', () => {
    expect(accountLoginAction({ userId: B, owner: null, cloudXp: null, localXp: 18270 })).toBe('fresh');
  });
  it('conta com save MENOR que o local de outra conta → carrega a conta (NÃO sobrescreve)', () => {
    expect(accountLoginAction({ userId: B, owner: A, cloudXp: 135, localXp: 18270 })).toBe('load');
    expect(accountLoginAction({ userId: B, owner: null, cloudXp: 135, localXp: 18270 })).toBe('load');
  });
  it('local DESTA conta à frente (sessão expirou, nuvem não gravou) → sobe o local', () => {
    expect(accountLoginAction({ userId: A, owner: A, cloudXp: 4000, localXp: 4668 })).toBe('push');
  });
  it('local desta conta igual/atrás → carrega a conta; sem save → sobe o seu', () => {
    expect(accountLoginAction({ userId: A, owner: A, cloudXp: 4668, localXp: 4668 })).toBe('load');
    expect(accountLoginAction({ userId: A, owner: A, cloudXp: null, localXp: 50 })).toBe('push');
  });
});
