---
name: tribos-acampamentos-objetivos
description: "Acampamentos inimigos no mapa e fila de objetivos executada na mão ou pelo piloto automático. decideIntent é o coração. Sessão 5 (Caio, 07/10)."
metadata:
  node_type: memory
  type: project
  modified: 2026-10-07
---

# TRIBOS — Acampamentos e Objetivos (idle / manual)

## O que é

O mapa deixa de ser só floresta: ganha acampamentos de saqueadores, e o jogador ganha uma **fila de
objetivos** que ele cumpre na mão ou deixa o piloto automático cumprir.

Clica num acampamento (no mundo ou no mapa) → entra na fila → tecla `G` liga o piloto → o personagem
vai, luta, se cura, recua quando apanha e volta. **Qualquer tecla de movimento devolve o controle na hora.**

**Why:** pedido do Caio em 07/10. Fura a ordem oficial dos blocos (combate é o 3, criaturas o 8), por
isso foi feito isolado e aditivo: movimento, câmera, cidade e o painel Home antigo não foram tocados.

## O coração: `decideIntent`

`src/game/systems/objectiveSystem.ts` exporta `decideIntent(snapshot, now): AutoIntent` — função
**pura e determinística** que responde "o que fazer agora": `move`, `attack`, `gather`, `heal`,
`retreat` ou `idle`. **O sistema decide, o laço de quadro executa.**

Quando houver Game Server, essa decisão sobe para o servidor sem reescrita.

Prioridade (documentada no código e coberta por teste):

1. morto → parado
2. vida abaixo de 35% e há cura → beber
3. mesma vida sem cura → recuar para a base (e **descansar** ao chegar)
4. inimigo perseguindo dentro de 7 m → revidar — **defesa própria vem antes da fila**
5. objetivo ativo: andar até entrar no alcance, então atacar ou colher
6. sem objetivo → parado

Constantes: `RETREAT_HP_RATIO = 0.35`, `SELF_DEFENSE_RADIUS = 7`, `ATTACK_RANGE = 3.2`,
`GATHER_RANGE = 3.2`, `ARRIVAL_RADIUS = 2.5`, `HUNT_AREA_RADIUS = 14`.

## O canal de movimento

O piloto **não inventou movimento**. O `Character` já tinha um ref de destino (`movement`) e já conduzia
o jogador até ele quando nenhuma tecla estava pressionada — só que ninguém nunca escrevia ali. O piloto
escreve nesse ref. Por isso o personagem anda igual nos dois modos.

## Acampamentos

| id | Nome | Tier | Posição | Inimigos | Respawn | Ouro |
|---|---|---|---|---|---|---|
| `raider_outpost` | Posto dos Saqueadores | 1 | (20, 14) | 3 | 240 s | 80 |
| `blackclaw_camp` | Acampamento da Garra Negra | 2 | (-26, 20) | 5 | 360 s | 190 |
| `crackedbone_warband` | Bando do Osso Rachado | 3 | (30, -24) | 7 | 480 s | 420 |
| `stonefist_stronghold` | Fortim do Punho de Pedra | 4 | (-32, -30) | 9 | 600 s | 900 |

Posicionamento é **regra em código** (`findPlacementIssues` em `data/camps.ts`), não olhômetro: checa
borda do mapa, distância do nascedouro, das ruínas e entre acampamentos.

Espécies de saqueador: `raider_scout` 45 HP · `raider_warrior` 95 · `raider_brute` 180 (quase mata o
jogador nível 1 sozinho) · `raider_shaman` 60 com alcance 7. Humanoides feitos com as mesmas primitivas
do jogador. Recompensa paga **uma vez por limpeza**, garantido por construção.

## Tipos de objetivo

`clear_camp` · `hunt_creature` · `gather_node` · `travel` · `hunt_area` (caçar numa região; nunca
termina sozinho, só cancelando).

## Arquivos

| Camada | Arquivo |
|---|---|
| types | `src/game/types/camp.ts`, `src/game/types/objective.ts` |
| data | `src/game/data/camps.ts` |
| systems | `src/game/systems/campSystem.ts`, `src/game/systems/objectiveSystem.ts` |
| state | `camps`, `objectives`, `targetId` em `game-store.ts` |
| mundo 3D | `src/components/world/` — `camp.tsx`, `raider.tsx`, `hostile-ai.ts`, `auto-pilot.tsx`, `world-entities.tsx` |
| HUD | painel de objetivos em `routes/index.tsx`, mapa em `components/hud/world-map.tsx` |

A IA de inimigo saiu de dentro do `game-world.tsx` e virou compartilhada entre lobo, saqueador e bicho.
**Os números do lobo seguem idênticos aos originais.**

## Armadilhas já pagas (não repetir)

| Armadilha | O que acontecia |
|---|---|
| `behavior` não sincronizado | A IA do mundo calculava a perseguição mas nunca gravava `chase`/`attack` no estado, então a defesa própria do piloto **nunca disparava** |
| Recuo sem saída | Sem regeneração passiva, o piloto recuava e ficava parado para sempre abaixo de 35% de vida. Agora chama `rest()` ao chegar na base |
| Corda longa demais | `leashRange` de 22–30 fazia o saqueador perseguir os ~24 m até a base e bater enquanto o jogador descansava. Passou a 11–16; o lobo mantém 25 |
| Clique duplo | Clique no terreno disparava dois ataques (`pointerdown` do terreno + `mousedown` do document) |

## Limites conhecidos

Sem pathfinding (anda em linha reta; não há colisão com nada no jogo). Sem culling por distância.
A marca `guard` dos postos ainda não tem peso. Balanceamento dos tiers 2 a 4 não foi jogado até o fim.

Relacionado: [tribos-cidade.md](tribos-cidade.md) · [tribos-progressao-combate.md](tribos-progressao-combate.md)
