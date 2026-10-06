---
name: tribos-visao
description: "Visão arquitetural do TRIBOS — estado atual do código, diagnóstico dos 16 problemas, 3 etapas de evolução, regras de produção."
metadata:
  node_type: memory
  type: project
  originSessionId: 1d6313bf-b086-4ca5-bcb4-18b1523664cb
  modified: 2026-10-06T16:02:49.269Z
---

# TRIBOS — Visão Arquitetural e Diagnóstico

## Estado atual (06/10/2026)
- 2 arquivos principais: `index.tsx` (96 linhas densas) + `game-world.tsx` (119 linhas)
- `styles.css` (316 linhas) — design system completo com CSS tokens + world palette
- Protótipo visual funcional: mundo 3D isométrico, personagem, lobos, ruínas, ponte, rio
- HUD completo: sidebar, header vitals, hotbar 8 slots, minimap SVG, quest tracker
- Simulação local: WASD, clique, coleta, ataque, forge simples, inventário placeholder

## 16 Problemas diagnosticados
1. **Itens não são itens** — array estático de ícones, sem tipo/peso/stack/rarity
2. **useState gigante** — HP, ouro, madeira, pedra, essência, poções tudo em useState separado
3. **Hotbar conceitualmente errada** — fixa no código, não aponta pro inventário
4. **useSlot() hardcoded** — slot 3=poção, slot 7=ataque por if/else
5. **Ataque é contador** — attack é número que incrementa, não ação com target
6. **hit() calcula dano no cliente** — -25 HP fixo, +15 ouro fixo, auto-dano fixo
7. **Loot fake** — collect() sempre dá mesma coisa independente do que clicou
8. **Peso fake** — fórmula manual (6.4 + wood*.15 + stone*.2)
9. **Inventário fake** — mostra 11/24 slots mas não existem 24 slots reais
10. **Death Bag inexistente** — morte só reseta valores
11. **Home é só modal** — deveria ser modo separado
12. **Forge fake** — setWood-10, setStone-8, setCrafted(true)
13. **Raid aparece cedo** — placeholder visual sem sistema
14. **Minimap desconectado** — SVG manual, não derivado do world state
15. **Index é o servidor** — HUD + banco + inventário + combate + craft + quest tudo junto
16. **Sem separação de sistemas** — zero game systems, zero store, zero types

## Arquitetura alvo
```
src/
├── components/game-world.tsx (render 3D)
├── game/
│   ├── types/ (player, item, inventory, creature, world, combat)
│   ├── data/ (items, recipes, classes, creatures)
│   ├── systems/ (inventory, combat, loot, crafting, movement)
│   └── state/game-store.ts (Zustand)
├── ui/ (GameHUD, Hotbar, Inventory, Equipment, LootWindow, CraftPanel, Home, Minimap)
└── routes/index.tsx (orquestrador, não servidor)
```

## 3 Etapas de evolução
### Etapa 1 — Protótipo jogável
Refatoração + WASD real + colisão + combate real + criaturas com HP + inventário 24 slots + peso real + hotbar funcional + equipamento + morte + Death Bag

### Etapa 2 — Loop completo
Loot por entidade + craft/forge real + base + warehouse + 3 classes + 2 criaturas + recursos respawn + persistência

### Etapa 3 — TRIBOS de verdade
Multiplayer + PvP + território + tribo + construção + FOB + raid + terminal + guerra

## Decisão técnica
NÃO conectar Supabase ainda. Primeiro jogo local com arquitetura correta (React → Game Store → Game Systems → Game World). Depois: Game Systems → Game Server → Supabase.

**Why:** o index.tsx virou o servidor do jogo — tudo misturado impede crescimento sem regressão.
**How to apply:** cada feature nova deve morar no sistema correto (types → data → systems → store → UI), nunca no index.
