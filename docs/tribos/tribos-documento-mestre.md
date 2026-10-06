---
name: tribos-documento-mestre
description: "Doc Mestre do TRIBOS — 96 seções, 16 blocos, 14 fases (A–N). Mundo multiplayer persistente, exploração+PvP+PvE+base+raid+guerra. Constituição do jogo."
metadata:
  node_type: memory
  type: project
  originSessionId: 1d6313bf-b086-4ca5-bcb4-18b1523664cb
  modified: 2026-10-06T16:02:14.957Z
---

# TRIBOS — Documento Mestre (selado 06/10/2026)

## Conceito
Mundo multiplayer persistente onde exploração, sobrevivência, progressão, PvE, PvP, construção, criaturas, operações e guerras acontecem no mesmo ecossistema.

> "O mundo dá o motivo. Você cria a história."

## Repositório
`https://github.com/OrbitrumConnect/epic-loot-adventure.git`
Stack: React + TypeScript + React Three Fiber + Three.js + TanStack Router/Start
Conectado ao Lovable — NÃO fazer force push / rebase de commits publicados.

## 15 Pilares selados
1. Mundo dá motivo  2. Online=aventura  3. Offline=manutenção  4. PvE cria valor  5. PvP cria risco
6. Raid cria vingança (não abandono)  7. Base vira conteúdo PvP  8. Entra com equipamento do mundo
9. FOB consome recursos reais  10. Morte tem consequência sem apagar progresso  11. Loot cria histórias
12. Ação importante gera decisão  13. Evitar burocracia  14. Próximo objetivo parece próximo
15. Gerar: risco + decisão + consequência + história

## Loop principal
MUNDO → necessidade → preparação → exploração → descoberta → conflito → risco → loot → consequência → BASE → forja/evolução → nova necessidade → MUNDO

## 4 estados de experiência
- **WORLD** — explorar, coletar, caçar, lutar, fugir, negociar
- **RAID/OPERATION** — 5–20 min, objetivo claro, alto risco
- **TERMINAL** — transição operação→base, cria risco (visível regionalmente)
- **HOME/BASE** — inventário, forge, construção, criaturas, tribo

## Direção visual
3D estilizado low-poly, câmera isométrica/diagonal, leitura quase 2D, silhuetas fortes, diorama vivo.
Refs: Project Zomboid (leitura espacial) + Ragnarok (personagens) + RuneScape (mundo persistente).
**Regra: refinar o estilo existente, NÃO trocar.**

## Arquitetura fundamental
```
CLIENTE → renderização / input / UI
GAME SYSTEMS → regras
GAME SERVER → autoridade em tempo real
SUPABASE → persistência
```
Three.js mostra. React controla interface. Game Server decide. Supabase guarda.

## Segurança absoluta
Cliente solicita → Servidor valida → Servidor atualiza → Cliente recebe estado.
NUNCA confiar no cliente para: dano, HP, posição, itens, dinheiro, loot, craft, morte.

## 16 Blocos de produção (ordem oficial)
1. Refatoração técnica  2. Movimento+câmera+colisão  3. Combate  4. Inventário+hotbar+equip
5. Loot+Death Bag  6. Craft+Forge  7. Base  8. Criaturas  9. Classes+progressão
10. Persistência  11. Multiplayer  12. Tribo  13. Raid+FOB  14. Terminal  15. Guerra  16. Mundo vivo

## Fases detalhadas (checklists no Doc Mestre seções 69–82)
A: Refatoração  B: Movimento/Mundo  C: Combate  D: Inventário  E: Loot
F: Craft  G: Base  H: Criaturas  I: Progressão  J: Multiplayer
K: Tribo  L: Raid  M: Guerra  N: Mundo vivo

## Vertical Slice (objetivo imediato)
Entrar → andar → ver criatura → atacar → matar → loot → pegar → inventário → hotbar → equipar → morrer → Death Bag → recuperar → base → armazém → forge → criar equip → voltar ao mundo.
**Se isso for divertido: TRIBOS existe.**

## Economia (3 camadas)
1. **Mundial** — Ouro, recursos, itens, equipamentos (jogadores movem)
2. **Tribo** — Armazém, produção, construção, FOB, guerra
3. **Premium** — Diamantes, skins, pets, cosméticos, bundles, temporadas

**Regra de monetização:** dinheiro compra expressão, o jogo conquista poder. Nenhum jogador precisa pagar para competir. Diamante NÃO vira Pix entre jogadores.

**Why:** documento base que todo código novo deve ser julgado contra — impedir crescimento torto.
**How to apply:** antes de implementar qualquer feature, verificar se conecta com o loop e passa pelo filtro das seções 90-95 do Doc Mestre.
