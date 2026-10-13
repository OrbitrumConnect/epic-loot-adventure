# Briefing para o Codex — Torres de defesa, persistência e hordas

Repo: `C:\Users\cleao\Documents\cl-projects\epic-loot-adventure` · branch `feat/pos-fase3` · árvore limpa, sincronizada com o upstream.
Stack: React 19 + Three 0.186 + React Three Fiber + Zustand + TanStack Start. Dev em `localhost:8000`.

## Economia de token — leia primeiro

**Metade deste pedido já está construída.** A seção "O que JÁ EXISTE" lista arquivo e linha. Não releia o repo inteiro para redescobrir isso, e não reescreva nada que está lá. Abra só os arquivos citados.

Regras de economia:
- Não rode `npm run dev` para "ver se funciona" a cada passo. Rode `npx tsc --noEmit` e `npx vitest run`, que são baratos, e abra o browser só nos marcos (fim de cada fase).
- Não leia `node_modules`, `art/packs/`, `public/models/*.glb` nem `.output/`.
- Não gere asset 3D novo. Reaproveite GLB que já está em disco e em cache.
- Não escreva documento de plano. Entregue código.
- Commits pequenos por fase, não um commit gigante no fim.

## Arquitetura — regra dura do projeto

Camadas: `types → data → systems → store → UI/HUD → render 3D`.

- Regra de jogo mora em `src/game/systems/` como **função pura**, recebendo `now` e `rng` como parâmetro. Componente 3D não decide regra.
- No laço de quadro: nada de `useState`; use refs e `useFrame`, leia a store com `getState()` sem seletor, use pool fixo e instancing, zero alocação por evento. Os padrões já corretos estão em `projectiles.tsx`, `combat-feedback.tsx` e `base-targets.ts` — copie o estilo deles.
- **Aditivo.** Não apague nem troque o que existe, principalmente visual.
- Proibido: force push, rebase, amend ou squash de commit já publicado.

## O que JÁ EXISTE — não reconstrua

| Coisa | Onde | Estado |
|---|---|---|
| Recursos `wood`, `stone`, `iron_ore`, `gold_ore`, `arcane_essence` | `src/game/data/items.ts:146,158` | Prontos |
| Nós farmáveis no mundo: 272 árvores, 94 pedregulhos, 76 rochas, 48 ferro, 22 ouro, 30 cristais | `src/game/data/harvest-nodes.ts:3-50` | Prontos, com `capacity` e `respawnMs` |
| Coleta com ferramenta, XP, distância | `src/game/systems/harvestSystem.ts`, `game-store.ts:1111` (`harvestAt`) | Pronto, 22 testes |
| Inventário que acumula | `src/game/types/inventory.ts`, `systems/inventorySystem.ts` | Pronto |
| Botão "Construir base" no HUD | `src/routes/index.tsx:302`, `components/hud/base-panel.tsx:170` | Pronto |
| Cobrança de recursos ao construir | `systems/playerBaseSystem.ts` (`placePieces`), custos em `data/base-pieces.ts` | Pronto — devolve "Material insuficiente" |
| **Ghost verde/laranja/vermelho ao posicionar** | `components/world/player-base.tsx:341-343,410-475` | Pronto: `GHOST_OK #4dff8f`, `GHOST_POOR #ff8a3c`, `GHOST_BAD #ff3b30` |
| Snap de grade (2 m) | `types/playerbase.ts`, `playerBaseSystem.ts:21-31` | Pronto |
| Modo de construção, teclas `N`/`X`/`Z`/`Enter`/`Esc` | `components/world/build-mode.ts` | Pronto |
| Peça `tower` com HP, custo e colisão | `data/base-pieces.ts` (6 madeira + 4 pedra, hp 200/450/900), `world/base-collision.ts:97` | **Existe, mas NÃO ataca** |
| Malha 3D de torre | `world/glb-watchtower.tsx` (`loudspeaker_tower.glb`, `watchtower.glb`) | Pronta, decorativa |
| Pool de projéteis (16 meshes, sem alocação) | `world/projectiles.tsx`, evento `shotEvent` em `systems/feedbackSystem.ts:74` | Pronto — **torre só precisa emitir o evento** |
| Dano, crítico, mitigação | `systems/combatSystem.ts` (`calculateDamage`, `resolveAttack`) | Pronto |
| Números de dano e sangue | `world/combat-feedback.tsx` | Pronto |
| Estágios da base `none→bed→foundation→walls→towers→enclosed→clash` | `systems/playerBaseSystem.ts` | Pronto, 25 testes — **não quebre** |

**Já é farmável tudo que torre e casa precisam.** Madeira e pedra saem de árvore e pedregulho na mão; rocha, ferro e ouro pedem picareta; cristal sai na mão. Não construa sistema de farm novo — se um recurso novo for preciso, acrescente um tipo de nó em `harvest-nodes.ts` reaproveitando `harvestSystem.ts`.

## O que NÃO existe — este é o trabalho

Verificado por busca: **zero** ocorrência de `localStorage`, `sessionStorage`, `indexedDB` ou `persist` do Zustand em `src/`. Nenhuma lógica de combate em torre. Nenhum sistema de ondas.

---

# Entregas, em ordem de dependência

Cada fase termina com `npx tsc --noEmit` exit 0, `npx vitest run` sem falha, e um commit próprio. Não comece a seguinte sem isso.

## Fase 1 — Torre que atira

Crie `src/game/systems/towerSystem.ts`, **puro**, recebendo `now` e `rng`:
- Dá à peça `tower` atributos de combate por tier em `data/base-pieces.ts`: alcance, dano, cooldown de disparo.
- Escolhe alvo entre criaturas hostis vivas dentro do alcance (prefira a mais próxima; empate pelo menor HP).
- Respeita cooldown por torre.
- Usa `calculateDamage` de `combatSystem.ts` — não reinvente cálculo de dano.

Ligue ao runtime num laço de quadro que varre as peças `tower` de `playerBase` e as criaturas vivas, no padrão de cache plano de `base-targets.ts`. Ao disparar, emita `shotEvent` para o `Projectiles` existente desenhar — origem na **ponta** da torre, não no centro (hoje o projétil do jogador sai de `y+1.1` fixo).

A morte da criatura deve reaproveitar o caminho que já existe no `game-store` (`behavior:'dead'`, `respawnAt`, `createDeathBag`), para o loot continuar caindo.

Teste puro em `src/test/tower-system.test.ts`: alvo escolhido, cooldown respeitado, alvo fora de alcance ignorado, criatura morta não é alvo.

## Fase 2 — Persistência

Não existe nada. Crie do zero, com cuidado para não quebrar a inicialização do mundo.

- Salve em `localStorage` com **versão de schema** (`{ v: 1, ... }`). Se a versão não bater, descarte e comece limpo em vez de quebrar.
- Salve: `playerBase` (claim e peças), inventário e equipamento, XP/nível/atributos, nós de colheita esgotados (só os que mudaram, não os 542), e o estado das torres.
- **Não salve** criaturas, posição de patrulha nem respawn: recrie com `createInitialCreatures()`/`createWildCreatures()` como hoje.
- Reidrate antes do primeiro quadro, sem quebrar `createHarvestNodes` nem `claimBase`.
- Grave com `debounce` (ex.: 2 s) e também ao sair da página. Nunca a 60 Hz.

Teste: salvar e reidratar devolve o mesmo estado; versão desconhecida não derruba o jogo.

## Fase 3 — Tipos de base no HUD

Hoje só existe uma base. Acrescente **3 tipos**, cada um com característica própria — por exemplo: mais HP nas peças; mais alcance nas torres; desconto de recurso. Escolha os números e documente no código.

- Área nova no HUD para escolher o tipo antes de reivindicar, perto do botão que já existe em `base-panel.tsx:170`.
- O custo em recurso tem que ser cobrado pelo caminho que já existe (`placePieces`), não por um novo.

## Fase 4 — Níveis de torre 1 a 20

**Não modele 20 torres à mão.** Faça a evolução **paramétrica**, derivada do nível: altura e número de segmentos, material, cor, e um ou dois adornos que aparecem em marcos (ex.: a cada 5 níveis). Reaproveite o GLB que já está em cache e varie escala, segmentos repetidos e material. Um conjunto pequeno de peças recombinadas dá 20 degraus legíveis sem 20 assets.

Cada nível muda também dano, alcance e cooldown — mecânica e visual andam juntos.

## Fase 5 — Hordas

- Quando o jogador assenta a base, aparece **cronômetro de 1 minuto** na tela.
- No zero, começa a onda: inimigos nascem fora do mapa visível e **vão até a base** (hoje o inimigo só bate na base se passar perto — veja `hostile-ai.ts:352-370`).
- Nova onda a cada minuto, cada uma mais difícil (quantidade, tipo, HP).
- Entre ondas, o jogador escolhe **upgrade** de torre ou de base. A escolha tem efeito real na mecânica, não só no texto.

Sistema puro em `src/game/systems/waveSystem.ts`, com teste.

## Fase 6 — Animação de morte

Hoje a criatura **some instantaneamente** (`hostile-ai.ts:251-253` faz `g.visible = false`). Troque por queda ou encolhimento curto (~0,4 s) antes de sumir. Barato e muda muito a leitura do combate.

---

## Barra de aceite

- `npx tsc --noEmit` exit 0 e `npx vitest run` sem falha **a cada fase**. Hoje são 216 testes passando em 15 arquivos; não derrube nenhum.
- Abra o jogo no browser ao fim de cada fase e confirme com os próprios olhos. Se o mundo 3D não renderizar, **antes de culpar o código** confira `document.visibilityState` e se o `requestAnimationFrame` dispara — painel oculto congela o laço de render e dá falso positivo.
- Não quebre os estágios da base: `towers` exige pelo menos 1 torre.
- Reporte o que **não** terminou, com o motivo. Entrega parcial honesta vale mais que relatório otimista.

## Se faltar cota

Prioridade, se tiver que cortar: Fase 1 → Fase 2 → Fase 5 → Fase 3 → Fase 6 → Fase 4. Torre que atira e jogo que salva valem mais que 20 níveis de visual.
