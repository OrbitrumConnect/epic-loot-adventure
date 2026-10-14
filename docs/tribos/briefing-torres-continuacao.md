# Briefing para o Codex — continuação (morte das criaturas + níveis de torre)

Repo: `C:\Users\cleao\Documents\cl-projects\epic-loot-adventure` · branch `feat/pos-fase3` · árvore limpa.
Stack: React 19 + Three 0.186 + R3F + Zustand + TanStack Start. Dev em `localhost:8000`.

## Leia isto antes de abrir qualquer arquivo

**O terreno mudou desde o teu último trabalho.** O Pedro empurrou 23 commits e o projeto foi sincronizado. Duas consequências diretas:

1. **Ele já fez as hordas** (`systems/waveSystem.ts`), que eram a Fase 5 do briefing anterior. Não refaça, não mexa.
2. **Ele reequilibrou números.** O HP da peça `core` subiu de 60 para 400; o alcance da torre tier 1 subiu de 12 para 17 m. Isso quebrou dois testes teus que fixavam literal — já corrigi derivando da tabela. **Nunca fixe número de balanceamento em teste; leia de `BASE_PIECES`.**

O que já está pronto e **não** deve ser reconstruído: torre que atira (`systems/towerSystem.ts`), save local (`systems/persistenceSystem.ts`), três tipos de base (`systems/baseTypeSystem.ts`), hordas com cronômetro de 1 min e cartas de upgrade entre ondas (`systems/waveSystem.ts`, `data/base-upgrades.ts`), farm, custo em recurso, ghost verde/vermelho, snap de grade, pool de projéteis.

## Economia de token

- Não releia o repo inteiro. Abra só os arquivos citados aqui.
- Não rode `npm run dev` a cada passo. `npx tsc --noEmit` e `npx vitest run` são baratos; abra o browser no fim de cada fase.
- Não leia `node_modules`, `art/packs/`, `public/models/*.glb`, `.output/`.
- Não gere asset 3D novo. Reaproveite o GLB que já está em cache.
- Não escreva documento de plano. Entregue código.
- Commit por fase, não um commit gigante.

## Arquitetura — regra dura

Camadas: `types → data → systems → store → UI/HUD → render 3D`. Regra de jogo mora em `src/game/systems/` como função **pura**, recebendo `now` e `rng` por parâmetro. No laço de quadro: nada de `useState`, use refs e `useFrame`, leia a store com `getState()` sem seletor, pool fixo e instancing, zero alocação por evento. **Aditivo**: não apague nem troque o que existe. Proibido force push, rebase, amend ou squash.

---

# Fase A — Animação de morte da criatura

**Faça esta primeiro.** É barata e, com horda na tela, muda muito a leitura do combate. Hoje dezenas de monstros simplesmente piscam pra fora da tela.

Estado atual: `src/components/world/hostile-ai.ts:261-262`. Quando `creature.behavior === 'dead'`, faz `g.visible = false` e `anc.alive = false` na hora. O respawn já existe logo abaixo, lendo `creature.respawnAt`.

O que fazer:
- Ao entrar em `dead`, rodar uma animação curta — por volta de 0,4 s — antes de esconder. Queda para o lado, ou encolhimento com afundamento no chão. Escolha uma e aplique a todas as criaturas.
- A animação é **puramente visual, no laço de quadro**. Não crie estado novo na store nem toque em `respawnAt`: guarde o instante da morte num ref local do componente.
- Respeite o respawn que já existe. Se a criatura reaparecer, ela tem que voltar com escala e rotação **limpas** — este é o erro mais provável desta fase: deixar o bicho renascer deitado ou achatado.
- Cuide do caso de a criatura morrer fora de tela: sem animação pendente travando o anchor.

Verifique no browser com uma horda ativa, não com um bicho só.

---

# Fase B — Níveis de torre, 1 a 20

Hoje a torre tem **3 tiers** (`data/base-pieces.ts`), com custo, HP e combate por tier:

| tier | custo | HP | alcance | dano | recarga |
|---|---|---|---|---|---|
| 1 | 6 madeira + 4 pedra | 200 | 17 | 18 | 1400 ms |
| 2 | 8 pedra + 4 madeira | 450 | 21 | 30 | 1100 ms |
| 3 | 6 ferro + 8 pedra | 900 | 25 | 46 | 800 ms |

A mecânica escala, mas **o visual é o mesmo GLB nos três**. E **não existe caminho de upgrade**: a peça nasce num tier e fica nele para sempre — confirmei que não há `upgradePiece` nem equivalente em `src/game/systems/`.

## A decisão de design — siga esta, não invente outra

Dois eixos de progressão na mesma torre viram ruído. Então:

- `tier` continua existindo e continua sendo **a escolha de construção** (que material eu posso pagar agora). Ele é load-bearing: a tecla `Z` do `build-mode.ts`, os custos e os testes dependem dele. **Não remova.**
- `level` (1 a 20) é a **progressão depois de construída**. A torre nasce num nível inicial derivado do tier — tier 1 → nível 1, tier 2 → nível 8, tier 3 → nível 15 — e sobe até 20 gastando recurso.
- Os três conjuntos de números da tabela acima viram **âncoras**. Os níveis entre eles interpolam. Assim os valores atuais continuam valendo e o balanceamento do Pedro é preservado.

## Mecânica

- `level: number` na peça `tower` (em `types/playerbase.ts`). Peça antiga sem o campo = nível derivado do tier. **Isso tem que funcionar com save existente** — `persistenceSystem.ts` valida com zod e precisa aceitar o campo como opcional, senão todo save atual é descartado.
- Sistema puro novo, `systems/towerLevelSystem.ts`: dado tier e level, devolve alcance, dano, recarga e HP interpolados; e o custo de subir um nível.
- Ação de upgrade na store, cobrando pelo caminho de recurso que já existe. Não crie caminho de cobrança novo.
- `towerSystem.ts` passa a ler os valores do nível em vez de ler o tier direto.

## Visual — paramétrico, não 20 modelos

**Não modele 20 torres.** O gancho já existe: `glb-watchtower.tsx:19`, `buildTower(scene, height)` escala o GLB por altura, e `GlbWatchTowers` hoje usa `BASE_TOWER_HEIGHT` fixo para todas.

Derive do nível:
- **altura** crescendo com o nível, dentro de um limite que não quebre o enquadramento;
- **cor/material** mudando por faixa — por exemplo madeira, pedra, metal;
- **um adorno** aparecendo em marcos (a cada 5 níveis): bandeira, segundo andar, cristal no topo. Reaproveite peça de GLB que já está em disco (`public/models/castle/` tem `tower-square-base`, `mid`, `top-roof` da Kenney, e já estão em cache).

Um conjunto pequeno recombinado dá 20 degraus legíveis. Mecânica e visual sobem juntos: quem vê a torre tem que saber que ela está mais forte.

## HUD

Mostrar o nível da torre e o custo do próximo nível, em algum ponto que já exista (`components/hud/base-panel.tsx`). Não crie painel novo se der pra pendurar no que tem.

---

## Barra de aceite, por fase

- `npx tsc --noEmit` exit 0 e `npx vitest run` sem falha. Hoje são **255 testes em 22 arquivos**; não derrube nenhum.
- Teste puro novo para `towerLevelSystem` em `src/test/`. **Derive os números esperados de `BASE_PIECES`**, não fixe literal — foi exatamente assim que dois testes teus quebraram quando o Pedro reequilibrou.
- Save antigo (sem `level`) tem que continuar carregando. Teste isso.
- Abra o browser ao fim de cada fase e confira com os próprios olhos. Se o mundo 3D não renderizar, **antes de culpar o código** confira `document.visibilityState` e se o `requestAnimationFrame` dispara — painel oculto congela o laço de render e dá falso positivo.
- Não quebre os estágios da base: `towers` exige pelo menos 1 torre.
- Reporte o que **não** terminou, com o motivo. Entrega parcial honesta vale mais que relatório otimista.

## Se a cota apertar

Prioridade de corte: **Fase A inteira** → mecânica da Fase B → visual da Fase B → HUD. Animação de morte entrega mais por token gasto que qualquer parte dos níveis.
