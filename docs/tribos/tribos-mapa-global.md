---
name: tribos-mapa-global
description: "M abre mapa global = hub de gestão do jogo. Invencível enquanto aberto. Base, inventário, raids, personagem — tudo ali. Mundo 3D fica limpo pra gameplay."
metadata:
  node_type: memory
  type: project
  modified: 2026-10-06T21:09:34.169Z
  originSessionId: 1d6313bf-b086-4ca5-bcb4-18b1523664cb
---

# TRIBOS — Mapa Global (tecla M)

## Definição (decisão Pedro 06/10)

**M** abre o mapa global como overlay. É o **hub de gestão** do jogo.

**Why:** Separar gestão de gameplay. O mundo 3D fica limpo (andar, lutar, coletar). Toda administração e planejamento acontece no mapa.

**How to apply:** O mapa global substitui boa parte dos painéis/modais atuais (home, raid, inventário, tribo). O mundo 3D só mostra HUD essencial (vida, hotbar, minimap).

## Regras

- Jogador fica **INVENCÍVEL** enquanto o mapa está aberto
- Não pode ser morto no mapa — é momento de gestão, não de gameplay
- ESC ou M de novo fecha e volta ao mundo

## O que o jogador faz no mapa global

- Ver a base (construções, armazém, defesas)
- Ajustar personagem (equipamento, skills, classe)
- Gerenciar inventário
- Ver mundo (regiões, pontos de interesse, criaturas)
- Encontrar raids disponíveis
- Clicar numa raid → lobby (esperar amigos ou iniciar solo)
- Ver tribo (membros, território, alianças)

## Impacto na UI atual

O que hoje é painel modal migra pro mapa global:
- `panel === 'home'` → seção "Base" no mapa
- `panel === 'raid'` → seção "Operações" no mapa
- `panel === 'inventory'` → pode manter atalho I, mas também acessível no mapa
- `panel === 'map'` → agora É o mapa global (M)
- `panel === 'tribe'` → seção no mapa

O mundo 3D fica com: vida/mana/vigor, hotbar, minimap pequeno, mensagens de combate.

## Relação com Doc Mestre

Alinha com §10 (Experience Layer), §12 (HUD), §26 (mapa como interface de decisão). O mapa não é decorativo — é onde o jogador PLANEJA antes de agir no mundo.
