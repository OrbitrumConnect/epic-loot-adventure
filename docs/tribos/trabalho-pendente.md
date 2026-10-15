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
- [~] **Encolher o volume da shadow-camera.** Hoje cobre 120×120 (−60..60); quando o
      passe de sombra dispara custa **+283 draw calls e +3,6M triângulos**. Reduzir para
      perto do jogador (ordem de 40×40). Risco baixo: sombra distante não é visível.
- [ ] **Rever as 18 point lights** (número simultâneo, raio, `decay`). Esforço baixo.
      Custo não isolado ainda — medir antes de mexer, não presumir ganho.
- [~] **Consertar a instância paralela do `window.__celStats`.** Hoje aponta para um
      módulo paralelo (HMR) e fica em 0 enquanto o render real roda, o que **impede
      medir o custo do pós cel-shade**. Só dev, risco nenhum. Destrava medição.
- [~] **LOD/impostor na floresta.** A árvore instanciada é 272×8868 = **2,4M triângulos**,
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
