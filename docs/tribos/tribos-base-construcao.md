---
name: tribos-base-construcao
description: "Selado 09/10 — construção da 1ª base por recursos + barra %, layout Lv1 PADRONIZADO (build manual único no open world consolida no padrão), recursos/armazém e storage (mochila vs baú vs cofre)."
metadata:
  node_type: memory
  type: project
  modified: 2026-10-09
---

# TRIBOS — Construção da 1ª base + recursos (selado 09/10)

Refina a Fase 3 (base persistente do Caio) e o `tribos-raid-guerra`. Vem do doc Pedro+(assistente) 09/10.
Regra: reusar sistemas de recurso/peça/estado existentes, sem duplicar, sem regressão.

## Modelo da 1ª base (selado)

- **Uma base lógica, 3 vistas:** Open World (visual) · Clash (gestão) · Raid (combate instanciado). NÃO são 3 bases.
- **Construção da 1ª base = build MANUAL ÚNICO no open world:** o jogador escolhe terreno, farma madeira/pedra, entrega, e uma **barra de %** sobe com o **build VISUAL aparecendo em etapas** (fundação→muros→porta→...). 100% = base pronta.
- **Layout Lv1 PADRONIZADO:** o jogador constrói de verdade (sensação de conquista), mas o resultado **consolida no layout oficial do Nível 1** (raids balanceadas; não vira "cada base um mapa único"). Aproveitar visualmente o que ele ergueu (não "some tudo e surge outra"). **Não precisa girar muro/escolher formato** nesta fase.
- Depois de pronta: progressão = **evoluir a base pelo Clash** (muros/torres/edifícios/tropas/defesas). Cada evolução muda a base visível no mundo E os atributos no Clash/Raid. Peça danificada em raid = aparece danificada no mundo e indisponível na defesa até reparar.

## Recursos e armazenamento (selado)

- **Coleta → armazém da base:** recurso coletado alimenta os **upgrades do Clash**. Cada entrega = progresso.
- **Mochila (mundo):** peso limitado; cai como death bag ao morrer (já existe).
- **Baú/armazém da base:** capacidade grande, **persistente**, "linkado" à conta (online). **É RAIDÁVEL** (x% saqueado num raid) — guardar é conveniência com risco.
- **Cofre protegido (futuro/monetizável):** fatia pequena do recurso protegida de raid (estilo Clash).
- **Cama (core):** coração da base. Wipe da cama = perde a base; **a progressão do PERSONAGEM (XP/armas/skills) sobrevive**.

## Multiplayer (confirmado, escalável)

Exploração/personagem = solo/sessão pequena · base/gestão/tropas = individual persistente · ataque a base = **instanciado** · defesa = IA sobre o estado persistente · assistência em raid = opcional com limite · mercado = compartilhado validado no servidor · cidades coletivas/guerra territorial = futuro. Instâncias limitam quantas simulações rodam juntas (não eliminam custo de servidor/segurança, mas tornam previsível).

## Regra pro Documento Mestre

> O jogador constrói sua 1ª base no open world com recursos coletados (build manual + barra %). Ao completar, consolida numa base estratégica de **layout Lv1 padronizado**, com posição territorial própria, aproveitando o que ergueu. Daí evolui pelo Clash; a representação física acompanha melhorias e danos. A base é **privada** (ninguém entra livre); ataques são **instâncias de Raid** que aplicam resultado à base real. Open World e personagem rodam em sessões individuais; interação entre players fica em sistemas controlados (Raid, assistência, mercado).

Relacionado: [[tribos-base-persistente]], [[tribos-raid-guerra]], [[tribos-3-camadas]], [[tribos-tribo-base-comum]], [[tribos-documento-mestre]].
