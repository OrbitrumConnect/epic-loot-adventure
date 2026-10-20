# Fila de trabalho pendente — TRIBOS

Este arquivo existe para ser lido por uma **tarefa agendada** (`tribos-retomar-trabalho`,
em `~/.claude/scheduled-tasks/`) que acorda sozinha e retoma o trabalho quando a cota
volta. Ele é a memória entre sessões: a sessão que termina deixa aqui o que falta, e a
sessão que acorda lê daqui.

**Mantenha atualizado.** Item concluído sai da lista (ou vira `[x]` com o commit ao lado).
Se a lista ficar vazia, a tarefa agendada se encerra em vez de inventar trabalho.

## Por que isto existe

Em 2026-10-15 a cota do Codex estourou à 00h50 e voltou às 02h14. O
`tools/codex-retry.sh` percebeu e retomou sozinho (tentativa 8, 02h17, exit 0) —
aquele lado funcionou. O lado do Claude não tinha equivalente e ficou das 00h50 às
08h19 sem fazer nada, porque **um modelo não é um processo**: eu só existo enquanto
alguém me chama. Nada me chamava. A tarefa agendada é quem chama.

## Pendente — por retorno sobre esforço

Fonte dos itens e dos números: `docs/tribos/investigacao-lag-2026-10-15.md`.

- [x] **Texturas 4096² dos personagens** — 89.343.261 → 11.525.081 bytes (−87%).
      Commit `2a421b4`. Era ~1,34 GB dos ~2,1 GB de VRAM.
- [x] **Encolher o volume da shadow-camera** — commit `9ba29e9`. 120×120 → 48×48 (±24).
      A luz direcional **não seguia o jogador** (target fixo na origem). Encolher sem
      consertar isso faria a sombra sumir ao andar mais de ~20 m da origem — a armadilha
      da tarefa. Luz e target passaram a acompanhar o jogador no laço de quadro,
      preservando a direção do sol, com zero alocação por quadro. Os 15 Hz do passe
      (`autoUpdate=false` + `needsUpdate`) ficaram intactos.
      Medido no quadro em que o passe dispara: draw calls **+310 → +177 (−43%)**,
      triângulos **+3,72M → +3,59M (−3,6%)**.
      **O ganho em triângulo veio bem menor que o relatório sugeria, e o motivo importa:**
      o custo de triângulo do passe é dominado por malha instanciada e pelo terreno, que
      são desenhados inteiros quando o bounding cruza o frustum. Frustum menor não
      subdivide malha única nem faz culling por instância. Quem quiser o triângulo tem
      que mexer no que projeta sombra, não no tamanho do volume. Fica registrado para
      ninguém reabrir esta porta esperando os 3,6M.
- [ ] **Rever as 18 point lights** (número simultâneo, raio, `decay`). Esforço baixo.
      Custo não isolado ainda — medir antes de mexer, não presumir ganho.
- [x] **Consertar a instância paralela do `window.__celStats`** — commit `feb1600`. Apontava para um
      módulo paralelo (HMR) e fica em 0 enquanto o render real roda, o que **impede
      medir o custo do pós cel-shade**. Só dev, risco nenhum. Destrava medição.
- [ ] **LOD/impostor na floresta.** A árvore instanciada é 272×8868 = **2,4M triângulos**,
      até 61% dos triângulos numa vista de floresta. Risco médio: mexe na silhueta da
      floresta, e o Pedro gosta do visual atual — não mudar sem mostrar antes/depois.
- [ ] **Merge intra-personagem das partes skinned de mesmo material.** 406 draw calls,
      40% do total. Esforço alto, risco médio (hierarquia de ossos). Deixar por último.
      Ressalva importante: fundir criaturas DIFERENTES quebraria a animação (o Pedro está
      certo nisso); o que vale é fundir partes do MESMO personagem, que compartilham o
      MESMO skeleton.

## Decisões que não são minhas

- **`public/models/bosses/wukong.glb` (20,8 MB), zero referência em `src/`.** O relatório
  sugeria apagar, mas `git log` mostra que ele é a **fonte** do kaiju em uso (commit
  `7b93a2e feat: kaiju = Wukong (Niu Mo Wang)`). Apagar asset de origem do Pedro é
  decisão dele, não minha. Perguntar no PR.

## Verificação em tela que ficou pendente

- Aberração (`monster.glb`) com tamanho e cor corretos — a altura agora deriva de
  `HERO_HEIGHT * 1.3` em `src/components/world/beast.tsx`.
- Câmera livre voando de verdade (tecla `` ` ``). O travamento de ponteiro não é
  testável em painel oculto.
- Lembrete de ambiente: **painel de browser oculto congela o `requestAnimationFrame`**
  e dá falso negativo de render. Conferir `document.visibilityState` antes de culpar o
  código.

## Regras que valem sempre (não são negociáveis)

- **Proibido force push, rebase, amend ou squash de commit publicado.** O Lovable está
  conectado ao repositório; reescrever história publicada quebra ele.
- PR sempre do fork `caiolea0/epic-loot-adventure` para o oficial
  `OrbitrumConnect/epic-loot-adventure`.
- Antes de encostar no projeto: preservar o que estiver solto na árvore, trazer
  `upstream/main` para dentro da branch, e só então testar e empurrar.
- Merge limpo não prova nada: rodar `npx tsc --noEmit` e `npx vitest run` sempre.
  Conflito semântico não aparece no git — já quebrou dois testes sem um único conflito.

## Legenda

`[ ]` aberto · `[~]` em execução agora · `[x]` concluído, com o commit ao lado.

## Merge do upstream pendente — 14 commits do Pedro, com sobreposição real

Conferido em 2026-10-15. **Não mesclar enquanto houver sessão editando**: três frentes
estavam escrevendo em `game-world.tsx`, `cel-shade.tsx` e nos arquivos da floresta
quando isto foi escrito. Mesclar por cima de edição concorrente é como se perde trabalho.

Dois commits dele pegam onde eu também mexi, e isto **não vai aparecer como conflito de
texto** — é conflito semântico, o tipo que o git não mostra:

- `8245cc4` (monster.glb reprocessado sem quantize) e `1f17285` (textura azul dos
  monstros multi-textura) resolvem **o mesmo bug** que o meu `82f81a4`. Ao mesclar,
  conferir qual asset sobrevive e se a cor continua certa — não presumir que os dois
  consertos se somam.
- `9929d8a` dimensiona monstro por `fixedScale` **medido** (`getBounds`), e `db67f91`
  tornou `height` opcional por causa disso. O meu caminho é `HERO_HEIGHT * 1.3`, altura
  derivada do herói, porque o Caio pediu que o tamanho da Aberração acompanhe o herói se
  ele crescer no futuro. **Os dois mecanismos competem pelo mesmo número.** Decidir qual
  manda, não deixar os dois ativos. A intenção do Caio (escalar com o herói) precisa
  sobreviver à decisão.
- `12e7918` já apagou `wukong.glb`, `insectoid` e `tribal-bug`. A pendência de apagar o
  wukong está morta — não refazer, e não ressuscitar os arquivos no merge.

Depois de mesclar: `npx tsc --noEmit` e `npx vitest run` obrigatórios, e conferir a
Aberração **em tela** (tamanho e cor), porque é exatamente o ponto de sobreposição.

## Atualização 2026-10-19 — retomada depois de quatro dias

**O limite SEMANAL estourou em 15/10** (reseta 19/10 20h, horário de Cuiabá) e derrubou
dois subagentes no meio do trabalho: a medição das 18 point lights e a redução de
triângulo da árvore. Os dois voltaram para `[ ]` — nada foi commitado por eles, e marcador
`[~]` velho mente sobre o estado. Isto é diferente do limite de 5 h que o
`codex-retry.sh` cobre: **nenhum mecanismo de retomada ajuda contra um limite semanal**,
porque a espera é de dias, não de minutos.

O `__celStats` ficou pronto (`feb1600`), com uma descoberta maior que a própria tarefa
registrada abaixo.

### Bug pré-existente achado ao consertar o `__celStats` — vale mais que o conserto

Em dev **com StrictMode**, o `useFrame` do `CelShade` nunca roda o caminho completo: cai
sempre no early-return porque `rtRef`/`quadRef`/`bloomARef`/`bloomBRef`/`bloomQuadRef`
ficam `null` para sempre. A cadeia: o cleanup effect anula esses cinco refs mas não os
materials; o StrictMode invoca o effect duas vezes (mount → cleanup → mount); no segundo
mount o resize effect faz early-return justamente porque `rtRef.current` é null, então
não recria os render targets; e o `useMemo` não re-executa nesse remount.

**Consequência: o pós cel-shade não renderiza em dev com StrictMode.** Não é só perda de
instrumentação. Caminho provável de conserto (não executado, decisão de arquitetura):
o resize effect recriar os RTs quando `rtRef.current` for null em vez de desistir, ou o
cleanup só anular/descartar no unmount real.

### Merge do upstream FEITO — 144 commits do Pedro

Mesclado em 19/10, zero conflito de texto. `tsc` 0 e **280/280** testes (ele somou dois
de capacidade de inventário). O que entrou de novo: multiplayer por link
(`src/net/multiplayer.ts`, `remote-players.tsx`), editor/admin com Supabase
(`src/components/editor/`, duas migrations), skin do herói refeita no Blender
(`glb-hero-mixamo.tsx`), terreno de deserto, biblioteca de assets de mapa, `three-mesh-bvh`
e `@supabase/supabase-js` como dependências novas.

**O `tsc` do `upstream/main` (e8212f0) estava quebrado**, e não por causa do merge:
`landmark-tree.tsx:38` usa `e.target` no `onMouseUp` do `TransformControls`, cujo tipo no
drei 10.7.9 é `(e?: THREE.Event) => void` — parâmetro opcional. Arquivo byte-idêntico ao
dele, nunca toquei nele, e o meu merge só mexeu em docs, texturas, `game-world.tsx` e
`cel-shade.tsx`. Pus uma guarda de uma linha (`e?.target` com `?.object`) porque
bloqueava toda verificação; não desfaz nada da intenção dele, o `if (!o) return` já
estava logo depois. **Avisar o Pedro** — se ele não roda `tsc` antes de empurrar, vai
repetir.

### Contradições nos diários dele — resolver antes de mexer nessas áreas

Não são minhas para decidir, mas quem encostar nisso precisa saber:

- **Alcance máximo da arma**: 50 m no diário de 17/10, teto de 35 m no de 18/10.
- **Velocidade do herói**: 3.2/4.8 e 2.0/4.8 no mesmo diário de 15/10.
- **Altura da Aberração**: `fixedScale` medido (dele) contra `HERO_HEIGHT * 1.3` (nosso,
  pedido do Caio para acompanhar o herói). **A versão dele foi a que ficou.** Se o Caio
  ainda quer o tamanho acompanhando o herói, isto precisa voltar à mesa — não reintroduzir
  por conta própria.
- **`wukong.glb`**: o diário de 15/10 manda apagar, e o commit `12e7918` já apagou.
  Pendência morta, não refazer.

### Estado do que o Pedro construiu, pelas palavras dele

- Skin do herói (`hero-preview.glb`): **pronta**, confirmada em tela por ele em 19/10.
- Multiplayer por link: **funcional**; migration `game_rooms` aplicada, código das RPCs
  ainda pendente.
- Editor ADM: **sem tabelas** em 16/10, status incerto em 18/10.
- Terreno de deserto: aplicado, **aguardando validação visual**.
- Biblioteca de assets de mapa: **só planejada**.
