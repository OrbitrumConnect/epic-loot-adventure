---
name: tribos-base-persistente
description: "Fase 3 — base persistente do jogador no mundo: claim no grid, construção por arrasto, perímetro fechado destrava a cidade. Sessão de 09/10 (Caio)."
metadata:
  node_type: memory
  type: project
  modified: 2026-10-09
---

# TRIBOS — Base persistente (Fase 3)

## A ideia em uma frase

O jogador reivindica um quadrado de terreno no mundo, ergue muro ali, e quando o perímetro fecha
a vista de cidade destrava. **Uma base, duas vistas:** ele anda dentro dela no mundo 3D e a
administra na tela isométrica.

Isso vem da direção selada do Pedro em 08/10: "bed → foundation → walls → towers → perímetro
fechado → **Clash desbloqueia** → produção auto".

## Decisão de arquitetura

A cidade isométrica (`BaseState`, de `types/base.ts`) **não foi substituída**. Ela virou a vista de
gestão desta mesma base, destravada pelo estágio `clash`. O `PlayerBaseState` é a entidade física;
a cidade é a camada de administração em cima dela.

## Como funciona

| Peça | Detalhe |
|---|---|
| Grade | `BASE_GRID = 2 m`. Tudo encaixa nela: claim, peças, prévia |
| Claim | Quadrado de 8×8 células (16 m). Recusa nascedouro, ruínas, acampamento, água, terreno íngreme e outra base a menos de 4 células |
| Validador | **Reaproveita `findPlacementIssues`** dos acampamentos (o agente extraiu `findPlacementProblems`; o antigo virou um `map` em cima). Não existe validador paralelo — era exigência do Pedro |
| Peças | `core` (cama), `wall`, `door`, `tower`, `roof`, em 3 níveis: madeira → pedra → ferro |
| Construir | Arrasta e estica, com snap na grade. `previewLine` devolve as células, o custo e o que está bloqueado; `placePieces` revalida e cobra |
| Perímetro | Inundação a partir de fora do claim. Se a água alcança a cama, está aberto. Porta conta como muro; telhado não |
| Estágios | `bed → foundation → walls → towers → enclosed → clash`, sem pular |
| Dano | Inimigo bate na peça quando o jogador está fora do alcance. HP zera, a peça cai, o perímetro é recalculado. Derrubar a **cama** é wipe: a base some e o terreno libera |

**Teclas:** `N` liga/desliga o modo de construção, `X` troca a peça, `Z` troca o nível, `Enter`
confirma o claim, `Esc` sai.

## Arquivos

| Camada | Arquivo |
|---|---|
| types | `src/game/types/playerbase.ts` |
| data | `src/game/data/base-pieces.ts` |
| systems | `src/game/systems/playerBaseSystem.ts` |
| state | `playerBase` + ações em `game-store.ts` |
| mundo 3D | `components/world/player-base.tsx`, `base-geometry.ts`, `build-mode.ts`, `base-targets.ts` |
| HUD | `components/hud/base-panel.tsx`, `base-picker.tsx`, `base-build-state.ts` |

**O estado do modo de construção vive em `components/world/build-mode.ts`** — é o canal entre o HUD
e o mundo, porque a store do jogo não tem campo para isso. `components/hud/base-build-state.ts` é só
um adaptador em cima dele. Os dois lados precisam falar com UM estado só: quando eram dois módulos
separados, o seletor escolhia uma peça e o mundo construía outra.

## Pontos para o Pedro decidir

| Ponto | Situação |
|---|---|
| **A cidade nasce trancada** | É a mudança de produto mais forte. Reversível virando `REQUIRE_BASE_FOR_CITY` para `false` em `playerBaseSystem.ts` |
| Cidade não re-tranca | Decisão minha: depois do `clash`, quebrar um muro abre o perímetro mas não tira a tela de gestão |
| Custos e HP | Calibração do agente, sem playtest |
| Fundação | É a primeira fiada de muros, não uma peça própria |

## Limites conhecidos

Sem colisão (o jogo não tem em lugar nenhum): criaturas atravessam os muros. Em terceira pessoa o
modo de construção solta o pointer lock, então a câmera não gira com o mouse enquanto constrói.
Fora desta rodada: junção de tribo, persistência, produção automática pós-`clash`, melhorar o nível
de uma peça já construída.

Relacionado: [tribos-cidade.md](tribos-cidade.md) · [tribos-acampamentos-objetivos.md](tribos-acampamentos-objetivos.md)
