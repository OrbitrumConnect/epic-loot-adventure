---
name: tribos-3-camadas
description: "TRIBOS = 3 jogos em 1: Mapa Aberto (survival/farm/PvP livre), Raid (MOBA/arena PvP tático), Base (builder estilo Clash). Loop: Base→Mapa→Raid→Base. Decisão Pedro 06/10."
metadata:
  node_type: memory
  type: project
  modified: 2026-10-06T21:21:14.523Z
  originSessionId: 1d6313bf-b086-4ca5-bcb4-18b1523664cb
---

# TRIBOS — 3 Camadas de Gameplay (decisão 06/10)

## Definição

TRIBOS é 3 modelos de jogo em 1, integrados por um loop fechado.

**Why:** Cada camada alimenta as outras. Sem base não tem equipamento. Sem mapa não tem recurso. Sem raid não tem conquista. O jogador nunca fica sem motivo pra jogar.

**How to apply:** Cada camada tem sua UI, controles e ritmo próprios. Mas compartilham o mesmo personagem, inventário, economia e progressão.

## Camada 1 — MAPA ABERTO (Survival/MMO)

- Andar pelo mundo 3D, coletar, caçar, explorar
- PvP livre: encontrou → decidiu → lutou
- Farm de recursos (manual ou automático futuro)
- Criaturas, eventos, rumores, descobertas
- Conceito "chiclete": sempre algo perto pra fazer
- **Referência:** RuneScape, Albion Online, survival games

## Camada 2 — RAID (MOBA/Arena)

- Entra com equipamento ATUAL (não loadout separado)
- Objetivo claro, 5-20 minutos, alto risco
- PvP tático e intenso (leitura espacial, decisão, consequência)
- FOB consome recursos reais da tribo
- **Raid PUXA recursos da base** — o que você gasta na raid sai do armazém da tribo
- **Cada raid tem LOCAL FÍSICO no mapa** — ponto de entrada, não menu abstrato
- **Defesa por players online OU NPCs/criaturas** — quem tá online defende, quem não tá deixa NPCs e defesas automáticas
- Encontrar raids no mapa global (M), esperar amigos ou ir solo
- **Terminal de retorno = longe da base** — saiu da raid, aparece a uma distância considerável, precisa VOLTAR andando
- **Raids visíveis no mapa pra TODOS** — qualquer player pode ir lá esperar quem sai pra emboscar/roubar
- **Bag NÃO fica pesada** — itens da raid cabem, não penaliza peso extra
- **Se morrer na volta, PERDE os itens da raid** — o que pegou na raid tá em risco até chegar na base
- **NÃO perde o que já estava na SUA base antes da raid** — seu armazém tá seguro, só perde o que tá carregando
- **O loot é do armazém da base que você RAIDOU** — você invadiu, pegou do armazém inimigo, agora precisa levar pra casa
- **O risco é no caminho de volta** — saiu da raid inimiga → terminal → volta andando → se morrer perde o que raidou, não o que tá na sua base
- **Referência:** LoL teamfight, Tarkov extraction

## Camada 3 — BASE (Builder/Strategy)

- Acessível pelo mapa global (M) — jogador fica INVENCÍVEL
- Construir, melhorar, defender: muralhas, torres, forge, armazém
- Estilo Clash of Clans: upar base, defender, produzir
- Criaturas patrulham e defendem quando offline
- A base construída VIRA o mapa que inimigos enfrentam na raid
- Gerenciar tribo, membros, cargos, alianças
- **Referência:** Clash of Clans, Age of Empires

## O Loop Fechado

```
BASE (prepara/evolui)
  ↓
MAPA ABERTO (coleta/encontra/PvP livre)
  ↓
RAID (conquista/risco/história)
  ↓
BASE (evolui com o que conquistou)
  ↓
(repete)
```

Cada camada PRECISA das outras duas:
- Sem base → sem equipamento → morre no mapa
- Sem mapa → sem recurso → base não evolui
- Sem raid → sem conquista → estagna

## Farm

- **Manual:** sair pro mapa e coletar (gameplay ativo)
- **Automático (futuro):** produção na base enquanto offline (pequena progressão)
- Regra: "Offline mantém. Online conquista."

## Impacto na implementação

| Bloco | Camada |
|---|---|
| 1-2 | Mapa Aberto (movimento, câmera, mundo) |
| 3-5 | Mapa Aberto (combate, inventário, loot) |
| 6-7 | Base (craft, construção) |
| 8-9 | Mapa Aberto + Base (criaturas, classes) |
| 10-11 | Infraestrutura (persistência, multiplayer) |
| 12-13 | Raid + Tribo |
| 14-16 | Terminal, Guerra, Mundo Vivo |

O vertical slice (Blocos 1-6) prova a Camada 1 + início da Camada 3.
