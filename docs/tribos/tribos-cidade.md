---
name: tribos-cidade
description: "Visão de cidade (Camada 3 — Base): cidade isométrica em sprites, 8 construções × 20 níveis, fila de obras, filas de produção, pesquisa e expedições. Implementada na Sessão 4 (Caio, 06/10)."
metadata:
  node_type: memory
  type: project
  modified: 2026-10-06
---

# TRIBOS — Cidade / Base (visão de cima)

## O que é

Tela de gestão da base, vista de cima em isométrico (referência de sensação: Rise of Kingdoms).
O jogador constrói, evolui construções, enfileira tropas/ferramentas/pesquisas e manda batedores explorar.
É a Camada 3 (Base) de [tribos-3-camadas.md](tribos-3-camadas.md).

**Why:** pedido do Caio em 06/10 para começar pela cidade. Fura a ordem oficial dos blocos (Base é Bloco 7),
por isso foi feita isolada e aditiva: nada de movimento, câmera ou combate foi alterado.

**How to apply:** toda regra da base vive em `src/game/systems/baseSystem.ts` (funções puras, recebem `now`).
A tela só chama ações do store. Ao mexer em custo, tempo ou fila, mexer em `data/` e `systems/`, nunca no componente.

## Como abrir

Item **Cidade** na navegação lateral ou tecla **B**. O mundo 3D não renderiza enquanto a cidade está aberta
(alinha com "invencível no mapa/gestão"). O painel antigo `Home · Base` continua existindo, intocado.

## Arquivos

| Camada | Arquivo |
|---|---|
| types | `src/game/types/base.ts` |
| data | `src/game/data/buildings.ts`, `src/game/data/units.ts` |
| systems | `src/game/systems/baseSystem.ts` |
| state | slice `base` em `src/game/state/game-store.ts` |
| UI | `src/components/city-view.tsx`, bloco `.city-*` em `src/styles.css` |
| testes | `src/test/base-system.test.ts` (27 testes) |
| arte | `art/city/` (prompts + scripts), sprites em `public/assets/city/buildings/` |

## Construções (todas vão até o nível 20)

| id | Nome | Função | Libera no Salão nv. | Máx. instâncias |
|---|---|---|---|---|
| `tribe_hall` | Salão da Tribo | Limita o nível das outras; define o armazém; depósito da mochila | início | 1 |
| `lumber_camp` | Acampamento de Lenhadores | Madeira por minuto | 1 | 3 |
| `quarry` | Pedreira | Pedra por minuto | 1 | 3 |
| `hunting_lodge` | Cabana de Caça | Comida por minuto | 1 | 3 |
| `war_camp` | Campo de Guerra | Fila de tropas | 2 | 1 |
| `scout_tent` | Tenda dos Batedores | Fila de batedores + expedições | 2 | 1 |
| `forge` | Forja | Fila de ferramentas (vão para a mochila do jogador) | 3 | 1 |
| `shaman_circle` | Círculo do Xamã | Fila de pesquisas (bônus permanentes) | 3 | 1 |

Eras por nível: 1–4 Pele · 5–8 Madeira · 9–12 Pedra · 13–16 Bronze · 17–20 Ferro.

## Regras (constantes em `data/buildings.ts`)

| Regra | Valor |
|---|---|
| Grade | 5×5 = 25 terrenos, Salão no centro |
| Construtores | 2 simultâneos; pedidos extras esperam em ordem de chegada |
| Custo do nível n | base × 1,4^(n-1) |
| Tempo do nível n | base × 1,45^(n-1); nível 1 leva 5–10 s |
| Produção por minuto | base × n × 1,12^(n-1) (nível 1: 30 madeira, 24 pedra, 24 comida) |
| Armazém | 500 (100 de essência) × 1,35^(nível do Salão − 1) |
| Vagas da fila de produção | 2 + floor(nível/3) + pesquisa "Logística Tribal" |
| Fila de produção | Só o primeiro item progride; cancelar devolve 100% |
| Pesquisa | custo × 1,6^rank, tempo × 1,5^rank |
| Expedições | 3 rotas (20 s / 60 s / 180 s; tenda nv. 1 / 3 / 6); simultâneas = 1 + floor(nível da tenda/5); saque determinístico |
| Estoque inicial | 300 madeira, 200 pedra, 150 comida, 10 essência |
| Escala de tempo | `BASE_TIME_SCALE = 1` multiplica obras, filas e expedições |

Recursos da base (`wood`, `stone`, `food`, `essence`) são separados da mochila. O botão de depósito no Salão
move madeira, pedra e essência arcana da mochila para o armazém: é o elo Mapa → Base do loop.

## Tempo

Tudo é por timestamp. `tickBase(state, now)` resolve em ordem cronológica tudo que terminou até `now`,
inclusive saltos grandes (várias obras e itens de fila num tick só). Pronto para "offline mantém" quando houver persistência.

## Sprites

`/assets/city/buildings/<id>/lvl-NN.webp`, 384×384, fundo transparente. Se o sprite de um nível faltar,
a tela tenta o nível inferior até o 01 e, por último, mostra um ícone. Pipeline em [art/city/README.md](../../art/city/README.md).

## Limites conhecidos

| Limite | Estado |
|---|---|
| Persistência | Não existe: recarregar a página zera a base |
| Autoridade | Regras rodam no cliente (protótipo local). Doc Mestre exige servidor; migrar `baseSystem` quando houver Game Server |
| Balanceamento | Níveis altos e essência não foram jogados; só há teste de que todo custo cabe no armazém |
| Cancelar obra | Não implementado (só cancelar item da fila de produção) |
| Chão da cidade | Gramado liso em CSS; sem muralha, caminhos ou decoração |
| ESLint | `.prettierrc` pede aspas duplas, o código do repo usa simples: 1540 erros de formatação já existiam antes da cidade |
| Painel `Home · Base` antigo | Lê a mochila, não o armazém da cidade. Unificar é decisão de design |
