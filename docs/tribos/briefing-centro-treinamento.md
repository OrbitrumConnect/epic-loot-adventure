# Briefing para o Codex — Centro de treinamento na base 3D

Repo: `C:\Users\cleao\Documents\cl-projects\epic-loot-adventure` · branch `feat/pos-fase3` · árvore limpa, sincronizada com o upstream.
Stack: React 19 + Three 0.186 + R3F + Zustand + TanStack Start. Dev em `localhost:8000`.

## Leia isto antes de abrir qualquer arquivo

**O centro de treinamento já existe.** Não construa um do zero.

Ele se chama `war_camp` (Campo de Guerra), vive na **cidade** (`src/game/data/buildings.ts:115`) e já tem tudo que o pedido descreve:

- níveis **1 a 20** com custo ×1,4 e tempo ×1,45 por nível
- **fila de produção** com capacidade (`enqueueUnit`, `getQueueCapacity` em `systems/baseSystem.ts`)
- **três unidades**: `warrior` (nível 1), `spearman` (nível 3), `archer` (nível 5) — `data/units.ts`
- sprites prontos em `public/assets/city/buildings/war_camp/lvl-01..20.webp`
- contador `BaseState.troops` já exibido em `city-view.tsx:588`

O que **não** existe é a ponte: o mundo 3D nunca lê `base.buildings` nem `base.troops`. Verificado por busca — `troops` só aparece em `city-view.tsx`, `baseSystem.ts` e `types/base.ts`.

**A tarefa é dar corpo 3D e clique ao que já funciona, não duplicar o sistema.**

## A decisão de arquitetura — siga esta

O projeto já tem a regra escrita em `docs/tribos/`: *uma base lógica com três vistas; cidade e mundo devem convergir no mesmo estado*. Então:

- **O `BaseState` da cidade é a fonte da verdade.** Nível do centro, fila e tropas ficam lá. Nada de um segundo sistema de treino dentro de `playerBase`.
- O prédio 3D na base é **um corpo para esse estado**: lê `base.buildings.war_camp`, e o clique chama as ações que já existem (`enqueueUnit`, `startUpgrade`).
- Isso evita a armadilha das **duas economias paralelas** que o projeto já carrega: a cidade usa `BaseResources` (wood/stone/food/essence), o mundo 3D usa o inventário. A ponte já existe (`depositFromInventory` em `baseSystem.ts:574`). Use-a, não invente uma terceira.

## REGRA INEGOCIÁVEL — uma fase, uma sessão

**Abra uma sessão NOVA do Codex para cada fase deste briefing.** Não rode duas fases na mesma sessão, e não rode o briefing inteiro de uma vez.

Isto não é preferência, é o que a medição mostrou. Agregando 800 sessões em `~/.codex/sessions`:

- **99,9% do gasto é input**, não saída: de 208,06M tokens do Astra, 207,33M são input e só 731k são output. O raciocínio é 0,07% do total — baixar o esforço **não resolve**.
- **Cada turno reenvia a conversa inteira.** Numa sessão real de 203 turnos neste projeto, o input por turno subiu de 43k para 175k, a um ritmo de **+915 tokens por turno**. Cobrado todo turno, o custo cresce ao quadrado do tamanho da sessão.
- O contexto base custa **35k** no primeiro turno. Sessão nova recomeça barata.
- Partir o mesmo trabalho em pedaços de 50 turnos corta **~50%**; em 25 turnos, **~60%**.

Ao fim de cada fase: commit, **encerre a sessão**, e abra outra para a fase seguinte. Se perceber que a sessão passou de ~50 turnos no meio de uma fase, feche, commite o que está pronto e continue em sessão nova.

## Economia de token

- Não releia o repo inteiro. Abra só o que está citado aqui.
- Não rode `npm run dev` a cada passo. `npx tsc --noEmit` e `npx vitest run` são baratos; browser no fim de cada fase.
- Não leia `node_modules`, `art/packs/`, `public/models/*.glb`, `.output/`.
- Não escreva documento de plano. Entregue código. Commit por fase.

## Arquitetura — regra dura

Camadas: `types → data → systems → store → UI/HUD → render 3D`. Regra de jogo em `src/game/systems/` como função **pura** recebendo `now`. No laço de quadro: nada de `useState`, use refs e `useFrame`, `getState()` sem seletor, pool fixo, zero alocação por evento. **Aditivo**: não apague nem troque o que existe. Proibido force push, rebase, amend, squash.

---

# Fase 1 — Persistir a cidade (bloqueante, faça primeiro)

Hoje **o `BaseState` inteiro não é salvo**. Confirmei: zero referência a `buildings`, `troops` ou `base` no schema de `systems/persistenceSystem.ts`. Recarregar a página apaga prédios, fila e tropas.

Treinar tropa que some no reload não é feature, é frustração. Então isto vem antes de qualquer visual.

- Acrescente `base` ao schema zod, **com todos os campos `.optional()`** e mantendo `v: 1`. Save antigo sem o campo tem que continuar carregando e cair no `createInitialBase()` — é o mesmo padrão que `pieces[].level` já usa.
- Inclua `base` em `persistedStateChanged`, `createLocalSave` e `restoreLocalSave`.
- **Cuidado com a fila:** ela usa timestamps absolutos (`Date.now()`). Ao restaurar, resolva o que já venceu em vez de deixar item preso no passado. O `towerLastShotAt` já faz isso com `Math.min(stamp, now)` — siga o mesmo cuidado.
- Teste: salvar/restaurar preserva prédios, fila e tropas; save antigo sem `base` carrega.

## Fase 1b — O relógio da cidade só anda com a cidade aberta

`tickBase` só roda dentro de um `setInterval` montado em `city-view.tsx:433`. Com a cidade fechada, a fila **congela**.

Se o jogador vai treinar tropa clicando no prédio no mundo 3D, a produção precisa correr com a cidade fechada. Mova o tick para um lugar que viva com o jogo — ou faça o catch-up por tempo decorrido ao ler o estado. Escolha um e deixe comentado o porquê.

---

# Fase 2 — O prédio 3D

Um `BasePieceKind` novo: `training`. Atenção, **isso toca 7 lugares** e o `tsc` quebra até todos estarem feitos, porque `BASE_PIECES` é um `Record` completo:

1. união em `types/playerbase.ts:15`
2. entrada em `data/base-pieces.ts` (custo por tier, HP, `solid: true`)
3. `placePieces` em `systems/playerBaseSystem.ts:347` (já é genérico, cobra por `basePieceCost`)
4. render — veja abaixo
5. `KIND_ROWS` e `counts` em `components/hud/base-panel.tsx:35,84`
6. `z.enum` em `systems/persistenceSystem.ts:36`
7. `isEnclosed` usa `solid` — decida se o centro fecha perímetro (sugiro **não**: ele é interno, não muro)

## Visual

Siga o padrão de `components/world/base-house.tsx` (`BaseHouse`): carrega o modelo, clona, escala automática por `Box3` até uma altura alvo, centraliza em XZ com a base em `y=0` sobre `terrainHeight`, e some o teto no iso por `clipPlane` local.

Um prédio GLB **não cabe no `InstancedMesh`** que desenha as peças comuns. A torre já resolveu isso escapando com `USE_GLB_TOWER` (`player-base.tsx:31`) e um componente próprio. Faça igual: componente `glb-training-camp.tsx`.

**Modelo:** não gere asset novo. Reaproveite o que já está em disco e em cache — `public/models/castle/` (Kenney) tem paredes, portão e peças de torre que recombinadas dão um barracão com cara própria, diferente da `WoodHouse`. Se preferir, `tribal-hall.tsx` já tem um tepee procedural **órfão** (ninguém o monta) que pode virar a base visual.

## Colisão — a armadilha

`houseCollider` em `house-collider.ts:24` é **singleton** (`{ current }`), ou seja, suporta **uma casa só**. Um segundo prédio exige o padrão de lista que a fábrica usa (`factoryColliders[]`), consumido em `base-collision.ts:26-85`. Não tente pendurar o centro no singleton: a casa do jogador para de colidir.

`pushOutBasePieces` (`base-collision.ts:92`) hoje só trata `wall` e `tower` — inclua o novo tipo.

---

# Fase 3 — Clicar no prédio

Nenhum prédio é clicável hoje, mas **o padrão existe** e é usado por acampamento, nó de colheita e criatura:

```
onPointerDown → markPointerConsumed(e.nativeEvent) → e.stopPropagation()
```

e `wasPointerConsumed` em `game-world.tsx:1357` impede que o clique vire ataque. Veja `camp.tsx:357` e `harvest-nodes.tsx:318`.

**Atenção:** `player-base.tsx:~630` registra um `pointerdown` em fase de captura com `stopImmediatePropagation` enquanto o modo de construção está ativo. O clique no centro precisa conviver com isso — teste com o modo ligado e desligado.

O clique abre um painel no HUD com: nível atual, fila em andamento com tempo restante, as unidades liberadas no nível, e o botão de evoluir com custo. **Chame `enqueueUnit` e `startUpgrade` que já existem** — não escreva fila nova.

---

# Fase 4 — Seção de administração no HUD

Em `components/hud/base-panel.tsx`, junto da seção **"Torres · evolução local"** que já está lá (`:175-200`), acrescente a administração da base.

O pedido do owner é poder, num lugar só: construir muros, construir o centro de treinamento, e evoluir.

**Um porém que você precisa saber:** a construção manual está **desligada**. Com base existente, o clique no mundo só mostra *"Para construir, farme recursos e entregue na base"* (`player-base.tsx:631`), e o `base-picker.tsx` não tem botões de peça — a base sobe por `deliverToBase`, com layout fixo de `systems/baseLv1.ts`. O seletor de peça (`BUILD_KINDS`, tecla `X`) existe em `build-mode.ts:20` mas está efetivamente morto.

Então decida e **diga o que escolheu**: reativar o fluxo manual para muro e centro, ou acrescentar botões no painel que colocam a peça por ação direta. A segunda é mais barata e menos arriscada. O que não vale é deixar o owner sem caminho para construir o centro.

---

# Fora de escopo nesta rodada — e por quê

**Tropas andando no mundo 3D.** Não existe nada: nenhuma entidade aliada, nenhuma IA de aliado (`hostile-ai.ts` só trata hostil). Isso é a maior parte do trabalho e vale uma rodada própria.

Nesta rodada, tropa é **número**: treina, entra em `base.troops`, aparece no painel. Se sobrar cota, o passo seguinte natural é fazer as tropas defenderem a base — mas **não comece isso antes das fases 1 a 4 estarem fechadas e testadas**.

---

## Barra de aceite, por fase

- `npx tsc --noEmit` exit 0 e `npx vitest run` sem falha. Hoje são **265 testes em 24 arquivos**; não derrube nenhum.
- Teste puro novo em `src/test/` para o que for sistema. **Derive números de `BASE_PIECES` e `BUILDINGS`, não fixe literal** — dois testes já quebraram assim quando o Pedro reequilibrou.
- Save antigo tem que continuar carregando. Teste.
- Não quebre os estágios da base (`towers` exige 1 torre) nem o `isEnclosed`.
- Abra o browser ao fim de cada fase. Se o mundo 3D não renderizar, **antes de culpar o código** confira `document.visibilityState` e se o `requestAnimationFrame` dispara — painel oculto congela o render e dá falso positivo.
- Reporte o que **não** terminou, com o motivo. Entrega parcial honesta vale mais que relatório otimista.

## Se a cota apertar

Prioridade de corte: **Fase 1 (persistir)** → Fase 2 (prédio) → Fase 3 (clique) → Fase 4 (HUD). Sem a Fase 1, todo o resto vira progresso que o jogador perde ao recarregar.
