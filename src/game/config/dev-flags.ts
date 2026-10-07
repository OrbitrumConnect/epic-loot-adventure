/**
 * Flags de desenvolvimento. PARA REMOVER DA PRODUÇÃO: apague este arquivo e os
 * usos de `DEV_INFINITE_POTIONS` em game-store.ts (useHotbarSlot, drinkPotion,
 * buildAutoSnapshot) — ou apenas troque o valor abaixo por `false`.
 *
 * Em build de produção `import.meta.env.DEV` já é `false`, então a flag se
 * desliga sozinha sem mexer em nada.
 */
export const DEV_INFINITE_POTIONS: boolean = import.meta.env.DEV === true;
