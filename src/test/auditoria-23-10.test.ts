import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { pushBag } from '@/game/state/game-store';
import type { DeathBag } from '@/game/types';

/* Auditoria 23/10 — correções pequenas e seguras. */
const bag = (id: string, createdAt: number): DeathBag => ({ id, ownerId: 'x', ownerName: 'x', position: { x: 0, z: 0 }, items: [], createdAt } as unknown as DeathBag);

describe('sacos de loot no chão (ninguém vê ainda) não crescem sem fim', () => {
  it('guarda no máximo 30 e descarta os de mais de 15 min', () => {
    const now = Date.now();
    let bags: DeathBag[] = [bag('velho', now - 16 * 60_000)];
    for (let i = 0; i < 40; i++) bags = pushBag(bags, bag(`b${i}`, now));
    expect(bags).toHaveLength(30);
    expect(bags.some(b => b.id === 'velho')).toBe(false);
    expect(bags[bags.length - 1]!.id).toBe('b39');
  });
});

describe('textos e travas', () => {
  const src = fs.readFileSync('src/routes/index.tsx', 'utf8');
  it('Editor ADM (F8) só abre rodando local', () => {
    expect(src).toMatch(/e\.code === 'F8' && import\.meta\.env\.DEV/);
  });
  it('Zerar personagem zera o estado ANTES de recarregar (salvamento de saída não grava o antigo)', () => {
    expect(src).toMatch(/useGameStore\.setState\(useGameStore\.getInitialState\(\), true\)/);
  });
  it('aba Home mostra o armazém REAL (cidade), não a bolsa', () => {
    expect(src).toMatch(/Math\.floor\(storage\.stone\)\} pedra/);
  });
  it('sem botão falso de raid; sem "Áudio desativado"; Loot fora do menu', () => {
    expect(src).not.toContain('<Swords />Iniciar operação');
    expect(src).not.toMatch(/Desativado nesta versão/);
    expect(src).not.toMatch(/\{ id: 'loot', name: 'Loot'/);
  });
  it('migração: cada um apaga só o próprio save', () => {
    expect(fs.readFileSync('supabase/migrations/202610230001_player_saves_delete_own.sql', 'utf8')).toMatch(/for delete to authenticated\s+using \(auth\.uid\(\) = user_id\)/);
  });
});
