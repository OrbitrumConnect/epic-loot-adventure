---
name: tribos-weapon-combat-system
description: "DIREÇÃO COMBATE (selada Pedro 08/10): Weapon System data-driven (arma = dado) + CombatController compartilhado (input humano E idle acionam o mesmo). Ranged primeiro: arco, pistola, rifle. LMB primário, RMB mira, Q/R especiais. Melee atual INTACTO. Mapa de raid = ciclo depois."
metadata:
  node_type: memory
  type: project
  modified: 2026-10-08
---

# TRIBOS — Weapon System + CombatController (selado 08/10)

Conversa Pedro×GPT. Mesma filosofia data-driven de [[tribos-visual-articulado]] (asset-swap) e
serve ao loop pós-colapso [[tribos-visao-pos-colapso]] (armas = infraestrutura recuperada).

## O que temos hoje (conferido)
- Só **corpo-a-corpo**: 1 ataque (LMB / mais próximo a 4 m), cooldown, retaliação.
- **Arma = item com `attackPower`** (espada 25, machado 15, machado de ferro 40…). Tocha já tem o "fogo".
- O **idle/piloto já chama o mesmo `store.attack()`** — humano e IA já dividem a ação.
- NÃO existe: ranged, mira (RMB), especiais (Q/R), projétil/munição/recarga, CombatController.

## Weapon System (data-driven)

Arma vira **dado**, não código por arma. Interface comum:

```
Weapon
├── type          (melee | bow | pistol | rifle | …)
├── damage · range · fireRate
├── projectile · ammo · reload · spread · recoil   (ranged)
└── specialAttack (Q/R dependente do equipamento)
```

O melee atual (`attackPower`) vira **um tipo** do sistema — **nada muda no que já funciona**.
Adicionar arma = **cadastrar um dado**, não reescrever combate. (GPT: "crie um Weapon System
extensível e cadastre as armas nele", não "adicione 4 armas".)

## CombatController (compartilhado)

```
INPUT HUMANO ─┐
              ├─► CombatController ─► executa (dano/projétil/cooldown)
   IDLE AI  ──┘
```

Humano aperta botão → CombatController executa. Idle decide sozinho qual ação → **mesmo**
CombatController. Evita o idle virar uma "segunda gameplay". O idle já usa `store.attack()`;
é formalizar esse ponto único.

## Controles (não conflita com os selados)

- `LMB` = ataque primário (= o "Click esquerdo = ATTACK" já selado)
- `RMB` = mira / ataque secundário
- `Q` / `R` = especiais universais (dependentes do equipamento), **configuráveis**
- Intactos: `1–8` slots · `E` pegar · `V` câmera · `M` mapa · `Shift` sprint · `Space` pulo · `B` cidade · `G` piloto

## Ranged — primeiro: arco, pistola, rifle (decisão Pedro)

- **Arco:** segura → carrega força → solta → flecha.
- **Pistola:** semi-auto, pouco recoil, alcance médio, carregador pequeno, recarga.
- **Rifle:** tiro potente, recoil, cadência menor, boa precisão, mira pela câmera (RMB zoom).
- Depois (se valer): sniper, espingarda. Projétil/munição/recarga locais no protótipo;
  **validação de dano/acerto migra pro servidor** na fase de autoridade/multiplayer.

## Escalabilidade + zero regressão

- **Escalável:** nova arma/ataque = dado novo no Weapon System; nenhum `if` por arma espalhado.
- **Zero regressão:** melee/`attackPower`/tocha-fogo **intactos**; o CombatController **embrulha** o
  `store.attack()` atual (não o substitui). Tudo aditivo, 136 testes seguem verdes.
- Sob o **orçamento de performance** ([[tribos-visual-articulado]]): projéteis em pool, sem alocar por tiro.

## Ordem (checklist pro elite)

1. Afinar personagem/ataque (em curso) → **registry / camada visual** (asset-swap).
2. **Weapon System + CombatController** — melee vira o 1º tipo; Q/R especiais; idle usa o controlador.
3. **Ranged:** arco → pistola → rifle (RMB aim, projétil em pool).
4. **Mapa interativo de raid** (`M` → zoom/pan → seleciona base → painel → RAID → validação) — **depende** do fluxo de entrada de raid existir.
