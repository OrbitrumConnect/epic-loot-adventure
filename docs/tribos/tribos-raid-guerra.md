---
name: tribos-raid-guerra
description: "Direção selada (Pedro+Opus, 09/10) da Camada 2 — Raid/Guerra: loop estilo Clash, raid escopado à base (snapshot offline / live online), dano físico + saque, escudo/ondas, guerra visível no mapa 2D e base em chamas no 3D. Não simular exércitos no mundo todo."
metadata:
  node_type: memory
  type: project
  modified: 2026-10-09
---

# TRIBOS — Raid / Guerra (Camada 2, direção selada 09/10)

Refina (não conflita) o Documento Mestre e `tribos-3-camadas` / `tribos-tribo-base-comum`.
A base construída (Fase 3, Caio) É o mapa da raid. Aqui é COMO a raid acontece.

## Princípio técnico (o que mantém escalável)

**A raid é escopada à BASE, nunca ao mundo inteiro.**
- **Offline → snapshot** da base-alvo (assíncrono, levíssimo, igual Clash of Clans).
- **Online → ao vivo** (defensor presente defende; senão NPC/defesas).
- **NÃO** simular exércitos marchando em 3D pelo overworld compartilhado (isso é MMO-RTS, pesa demais e não escala pra web/mobile F2P).

## O loop (estilo Clash of Clans / Rust)

- O atacante chega na base-alvo (no mundo) e o combate acontece **ali, escopado à base** — a instância carrega ao redor da base, **sem teleporte visível** pro jogador. Dentro, tropas empurram estilo MOBA/Age, 3ª pessoa jogável.
- **Dano físico nas peças:** inimigo encosta na peça (fora do alcance do defensor) → dana. HP zera → peça cai → perímetro recalcula (já existe no sistema do Caio).
- **Saque:** enquanto ataca, coleta recurso do armazém da base ao longo do tempo.
- **Sucesso parcial:** atingiu **x% de saque/destruição = raid bem-sucedido** (não precisa zerar). **Wipe total só se chegar na cama** (regra do Caio).
- **~5 investidas/ondas** pra derrubar o núcleo → o defensor **segura, reconstrói, revida**. Dano por raid é PARCIAL.

## Economia

- **A raid CUSTA recurso da base atacante** (tropas/logística). **Tem que render mais do que custa** — senão ninguém raida. Balancear pra ser net-positivo quando bem-sucedido, e perda quando falha.

## Pós-raid (a selar o número exato)

Base raidada ganha uma **janela (~15 min)**. Dois sabores (dá pra combinar):
- **Escudo:** protegido, não pode ser atacado por X tempo (defensivo, estilo Clash).
- **Janela de ondas:** vulnerável a ataques consecutivos (mesmo player ou outros) até estabilizar (ofensivo, "guerra").
Sugestão: **escudo curto após um wipe** + **janela de ondas durante o cerco ativo**.

## Sensação de guerra (barata, sem pesar)

- **Mapa 2D:** ícone de exército/ataque indo base→base; "guerra declarada", linhas animadas. Quem está online vê. É só metadado.
- **Mundo 3D:** ao passar perto, a base sob ataque/raidada aparece **em chamas / fumaça** (fogo + emissivo nas peças danificadas; escombros fumegando se wipada). Dá a sensação de "algo rolando ali" sem simular exército.

## A sequência de camadas (visão do Pedro, confirmada)

Cidade (gerir base, remanejar tropas, farmar, evoluir) → botão **"Mapa geral"** → vê o mundo e as bases → clica numa base inimiga → **raid**. Overworld compartilhado; "offline mantém, online conquista".

## Guerra multi-tribo (terceiros entram no raid) — Fase M

Um raid em andamento é **aberto a terceiros** (quem está no mundo perto da base em guerra, ou vê no mapa, pode escolher lado). Detalha a **Fase M (Guerra)** do Mestre + alianças (Camada 3). Três entradas:
- **Atacar junto (aliar):** outra tribo entra AO LADO do atacante (reforço). Divide o espólio por acordo/tribo.
- **Atacar o atacante:** terceira tribo cai em cima de quem está atacando — defende o alvo (aliança defensiva) ou quer o espólio pra si.
- **Abutre (swoop no fim):** chega depois do alvo enfraquecido e **engole geral** — "o maior leva o resto".

Isso gera **guerra emergente, alianças e traições** (o coração da Fase M). Precisa de **declaração de guerra / lados** claros na UI pra não virar confusão.

**Técnico (mantém escalável):** continua **escopado à base-alvo** — a instância comporta **N participantes naquela base**, não o mundo todo. **Limite de participantes por raid a selar** (perf/netcode). Multi-party é essencialmente **online/live** (a Fase 10 habilita); offline continua snapshot 1-atacante assíncrono.

## A SELAR depois (números/online)

- x% de sucesso do raid; quanto cada onda derruba (pra dar os ~5 pra wipe); custo exato da raid.
- Escudo vs janela de ondas (duração).
- Online de verdade (bases de outros players) = Fase 10 (Supabase + instâncias). Localmente dá pra simular com bases NPC.

Relacionado: [[tribos-3-camadas]], [[tribos-tribo-base-comum]], [[tribos-base-persistente]], [[tribos-documento-mestre]].
