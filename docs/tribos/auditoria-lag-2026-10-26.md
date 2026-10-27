# Auditoria de travamento — 26/10/2026

Medido em `npm run dev` (Vite :8000), Chrome do painel do Claude, RTX 2060, `devicePixelRatio` 1.
Toda medição veio de sonda instalada na página ao vivo; nada aqui é estimativa, salvo onde está escrito
`[NÃO VERIFICADO]`. Base: `upstream/main` em `4d74506` (mesclado neste branch).

## 1. O que o jogo gasta por quadro

| Medida | Valor | Como foi medido |
| --- | ---: | --- |
| FPS | **10 a 16** | contador de `requestAnimationFrame` |
| Tempo de quadro | **61 a 92 ms** | 1000 / FPS |
| **GPU** | **3,56 ms** (mediana), 20,6 ms (p90) | `EXT_disjoint_timer_query_webgl2` |
| `gl.render` (CPU) | **12,4 ms** | `WebGLRenderer.render` instrumentado |
| `useFrame` de jogo (todos os 715) | **9,6 ms** | cada assinante do R3F cronometrado |
| **Fora de `useFrame`** | **46,6 ms (68% do quadro)** | tempo de quadro − soma dos `useFrame` |
| Tarefas longas | 30 em 7 s, maiores de **460, 363, 293, 292 ms** | `PerformanceObserver('longtask')` |

**A GPU está ociosa.** 3,56 ms de GPU dão 280 FPS. O travamento é 100% CPU/JavaScript.

## 2. Causa raiz: a página re-renderiza e leva a árvore 3D inteira junto

### Hipótese que foi DERRUBADA (não reabrir)

A primeira suspeita foi `world-entities.tsx:45-55` — o `roster` em string e o `useMemo` que recria um
objeto `start` por criatura. **Errado.** Medido ao vivo: `roster` mudou **0 vezes em 12 segundos**. O
`useMemo` não refaz a lista, e `Enemies` não aparece entre os componentes que re-renderizam. O comentário
no topo daquele arquivo está correto: só mudança de elenco remonta a lista, e elenco quase não muda.

### A causa real

Carimbei o instante de cada re-render de componente R3F e agrupei em janelas de 20 ms:

```
janelas de 20 ms com re-render:  8 em 8 segundos
tamanho de cada lote:            708, 708, 708, 708, 708, 708, 708, 708
```

Não são criaturas re-renderizando por conta própria. É **a árvore 3D inteira, todos os 711 componentes,
de uma vez só, várias vezes por segundo**. Um gatilho único, acima do `<Canvas>`.

O gatilho está em `src/routes/index.tsx`:

```ts
// linha 253-258 — relógio do jogo, 1x por segundo
const [clock, setClock] = useState(() => gameClock(WORLD_EPOCH));
useEffect(() => {
  setClock(gameClock());
  const id = setInterval(() => setClock(gameClock()), 1000);
  return () => clearInterval(id);
}, []);
...
// linha 697 — no MESMO componente
<GameWorld mode={ui.mode} attack={attackTick} onCollect={collectNearest} ... />
```

`clock` é usado em dois lugares: `void clock` (linha 261, para recalcular o cooldown do especial) e
`<span>Dia {clock.day} · {clock.time}</span>` (linha 851). Dois pedaços de texto do HUD. Mas o `setClock`
re-renderiza o componente `Index()` inteiro, e **`GameWorld` não é memoizado** — então os 711 componentes
3D re-renderizam junto. Os seletores da store no mesmo componente (`player`, `attackTick`, `ui`,
`lastBoostFireAt`...) fazem o mesmo, o que eleva de 1 para 3,47 rajadas por segundo.

Baseline medido (10,1 s, cena com 711 assinantes de `useFrame`):

| Medida | Valor |
| --- | ---: |
| FPS | **12,0** |
| Re-renders de componente R3F | **2.464 por segundo** |
| **Rajadas de árvore inteira** | **3,47 por segundo** (maior lote = 711 = todos) |
| Custo de uma rajada | **290 a 330 ms de thread travada** |

3,47 × ~300 ms por segundo é mais de um segundo de trabalho por segundo de jogo. É isso que trava.

**Correção**: `React.memo` no export padrão de `game-world.tsx`. As 7 props vindas de `index.tsx:697` já
são estáveis (primitivas, ações da store, e um `useCallback` com deps `[attack, cameraMode]`), então o
memo corta as rajadas sem mexer em nenhuma regra de jogo.

## 3. Segunda causa: lixo de memória

| Medida | Valor |
| --- | ---: |
| Heap em 9 s | **579 → 722 MB** |
| Taxa de alocação | **15,3 MB/s** |
| Quedas de heap (coleta) na janela | 1, de 1,3 MB |
| Limite do heap | 4.192 MB |

O heap só sobe. Quando o V8 enfim recolhe, para a thread — é a origem provável das tarefas longas de
250 a 460 ms. Inventário de alocação por quadro: `r1-perframe.md` (sonda estática, 7 categorias).

## 4. Inventário da cena (do `WebGLRenderer` do próprio jogo)

| Medida | Valor |
| --- | ---: |
| Objetos no grafo de cena | **24.583** |
| Meshes | 4.726 (4.314 visíveis) |
| Triângulos na cena | 17,79 M |
| Triângulos desenhados por quadro | 5,01 M |
| Draw calls | 169 a 335 |
| **Materiais únicos** | **1.233** |
| **Programas de shader** | **139** |
| Geometrias únicas | 1.473 |
| `SkinnedMesh` | **230** |
| `InstancedMesh` | 241 (63.149 instâncias) |
| Luzes | 20 (1 com sombra) |
| Assinantes de `useFrame` | **715 a 812** |
| `shadowMap.autoUpdate` | **true** |

Uma travessia da cena custa 1,97 ms; `updateMatrixWorld` forçado, 5,88 ms.

A/B da sombra: `autoUpdate=false` levou 13,7 → 14,4 FPS (**+5%**). Pouco — a sombra não é o gargalo.

## 5. Assets: textura solta é o consumo de VRAM e RAM

`tools`/scan com `@gltf-transform/core@4.5.1` sobre os 89 `.glb` de `public/models`:

| Medida | Valor |
| --- | ---: |
| Arquivos | 89 |
| Soma em disco | **209,24 MB** |
| Soma de triângulos de TODOS os modelos | 2.654.963 |
| **VRAM de textura sem mipmap** | **617,56 MiB** |
| **Arquivos comprimidos (Draco / meshopt / KTX2)** | **0 de 89** |

Os modelos quase não têm triângulo (2,65 M somados, contra 5 M desenhados por quadro — o peso de
triângulo vem de repetição, não de malha pesada). O que pesa é textura PNG/JPG crua: 617 MiB na GPU.

Bundle de produção: `@react-three/drei` 2.384 kB (gzip 486 kB), `game-world` 525 kB (gzip 148 kB).

## 6. Plano, em ordem de ganho medido

| # | O quê | Onde | Ganho esperado |
| --- | --- | --- | --- |
| 1 | `React.memo` no export padrão de `GameWorld` | `game-world.tsx:2476` | tirar as 3,47 rajadas/s de ~300 ms — o maior ganho |
| 1b | Isolar o relógio e os cooldowns em componentes-folha do HUD | `routes/index.tsx:253-258, 697` | tira a causa na origem, não só o escudo |
| ~~2~~ | ~~Cortar alocação por quadro~~ — **cancelado**: o `memo` já curou (ver 6c) | — | — |
| 2 | Não desenhar o corpo 3D de criatura fora do alcance de visão | `world-entities.tsx`, `beast/raider/wolf` | 16,5 → 30,4 FPS medido |
| 3 | Texturas para KTX2/Basis + mipmap | 89 GLB | 617 MiB → algo perto de 100 MiB de VRAM |
| 4 | Compressão de malha (meshopt) + `Cache-Control` para `/models/*` | `public/models`, `_headers` | 209 MB → bem menos no download |
| 5 | Compartilhar material por variante | 1.233 materiais, 139 programas | menos draw call e menos troca de shader |
| 6 | `shadowMap.autoUpdate = false` com `needsUpdate` sob demanda | renderer | +5% medido |
| 7 | Chunk do `drei` + `Cache-Control` do bundle | `vite.config.ts` | carga inicial |

Cada item entra em um subagente separado, com prova em tela (print antes/depois) antes de ser aceito.

## 6b. Item 1 — FEITO e medido

`src/components/game-world.tsx`: o export padrão virou `memo(GameWorld)` (6 linhas somadas, 2 trocadas).
Nenhuma outra linha do jogo foi tocada.

Medido na mesma cena, mesma máquina, duas rodadas de 10 s cada:

| Medida | Antes | Depois |
| --- | ---: | ---: |
| FPS | **12,0** | **26,5 e 30,0** |
| Re-renders de componente R3F | 2.464 por segundo | **0** |
| Rajadas de árvore inteira | 3,47 por segundo | **0** |
| Maior lote re-renderizado | 711 (todos) | **0** |
| Heap em uso | 580 a 722 MB | 488 MB |

**Mais que o dobro de FPS, com 6 linhas.**

Conferido que nada quebrou:

- `npx vitest run`: **908 passam, 1 falha** — `dificuldade-mundo.test.ts`. A falha é **anterior e de
  ambiente**: o teste compara o TEXTO de `hostile-ai.ts` com `/...\)[;\n]/`, e este worktree está com
  `core.autocrlf=true` e sem `.gitattributes`, então a linha termina em `\r\n` e o `\r` não casa. O
  arquivo `hostile-ai.ts` não foi tocado por esta mudança (`git diff --name-only` = só `game-world.tsx`).
  Vale um `.gitattributes` com `* text=auto eol=lf` para não voltar a morder em máquina Windows.
- Teste de fiação novo: `src/test/game-world-memo.test.ts` (o export padrão é memo E `index.tsx` continua
  passando por ele).
- Na tela: relógio do HUD segue ticando (08:57 → 09:00), criaturas seguem andando, e o botão de Câmera
  troca isométrica ↔ 3ª pessoa normalmente — ou seja, as props ainda atravessam o `memo`. Prints antes e
  depois sem diferença visual.

### Achado separado, para o Pedro (NÃO é regressão desta mudança)

Os 2 `raider_samurai` (Couraça de Espinhos) estão na cena com escala de mundo **6,808**, dando cerca de
**9,4 m** pela extensão dos ossos, enquanto `raider.tsx:92` declara `height: 3.32`. Medi **com e sem** o
`memo`: o número é idêntico nos dois (6,808 / 9,36 m), então vem de antes e não desta mudança. Pode ser
só a métrica (extensão de osso não é altura visual em rig com `bindFix`), mas vale o Pedro olhar na tela.

## 6c. Item 2 — FEITO e medido (e mudou de alvo no caminho)

### O item 2 do plano original perdeu o sentido

O plano dizia "cortar alocação por quadro". Medido depois do `memo`: a alocação **já tinha curado
sozinha**, porque quase todo o lixo era re-render do React.

| Medida | Antes do memo | Depois do memo |
| --- | ---: | ---: |
| Alocação | 15,3 MB/s | **5,3 MB/s** |
| Heap | 580 → 722 MB, subindo sem parar | oscila 588–615 MB, 8 coletas em 12 s |
| Maior pausa de GC | **460 ms** | **59 ms** |

Não sobrou problema ali. Fui atrás de onde o tempo passou a ir.

### O alvo real

Com 27 ms por quadro: `useFrame` do jogo 8,3 ms · `gl.render` **14,5 ms** (dos quais **10,6 ms antes do
primeiro desenho**) · fora do laço 6,4 ms.

Esses 10,6 ms são `scene.updateMatrixWorld` passando por **24.510 objetos, 15.906 deles ossos** de 193
criaturas. Desligando o update: 22,1 → 37,1 FPS.

Três hipóteses foram testadas e **duas caíram**:

| Teste | Resultado |
| --- | --- |
| `matrixAutoUpdate = false` em todos os 15.906 ossos | +4%. Não é isso. |
| `visible = false` nas 194 criaturas | **0%**. `updateMatrixWorld` não olha visibilidade. |
| Tirar criatura distante da cena | 32,8 → 51,5 FPS. **É isso.** |

Raio medido, não chutado: a câmera **isométrica** mostra 8 a 13 criaturas, a mais distante a **69 m**; a
de **3ª pessoa** mostra 19, a mais distante a **122 m**. Daí os raios 85 m (iso), 135 m (3ª pessoa) e
nenhum corte na câmera livre, que voa para qualquer lado.

### Primeira tentativa REPROVADA (não repetir)

Desmontar o componente da criatura longe dava 52,3 FPS, mas tinha dois defeitos medidos:

1. **A IA parava.** Em 6 s, 123 de 124 criaturas até 85 m andaram, contra **3 de 68** além disso. O laço de
   IA e o renascimento vivem dentro do componente (`hostile-ai.ts:385` e `:418`). A horda que caminha para
   a base congelaria com o jogador longe.
2. **A criatura voltava no lugar errado.** O cache de `start` guardava a posição da PRIMEIRA montagem, e
   `start` é a posição inicial do grupo (`beast.tsx:338`); como `flushPositions` (`hostile-ai.ts:212-229`)
   grava o grupo de volta na store, o teletransporte viraria permanente.

### O que foi feito

A criatura **nunca desmonta** — a IA segue rodando e `start` só é lido uma vez. O que deixa de ser
desenhado longe é só o **corpo 3D** (GLB, rótulo, anel, aura); o `<group ref>` externo continua nos dois
caminhos, senão a IA perde a alça para mover o bicho. `Beast`, `Raider` e `Wolf` viraram `memo`, então só
re-renderiza a criatura cujo booleano virou.

Medido na mesma sessão, mesma cena, 192 criaturas:

| Medida | Só com o memo | Com o corte de corpo |
| --- | ---: | ---: |
| FPS | **16,5** | **30,4** |
| `gl.render` | 19,0 ms | **11,1 ms** |
| Objetos na cena | 24.420 | **15.975** |
| Ossos | 15.906 | **9.997** |
| Malhas com esqueleto | 229 | 150 |
| Heap em uso | 709 MB | **514 MB** |

Conferido que nada quebrou:

- **IA viva**: 62 de 62 criaturas além de 85 m mudaram de posição em 8 s (100%).
- **Nada sumindo da tela**: 0 criaturas dentro do quadro sem corpo, no isométrico e em 6 amostras na 3ª
  pessoa (a mais distante no quadro a 118 m, dentro do raio de 135). 0 dentro de 85 m sem corpo e 0 além
  de 100 m ainda com corpo — a histerese está valendo.
- `npx vitest run`: **914 passam**, só a falha CRLF pré-existente de `dificuldade-mundo.test.ts`.
- Prints do isométrico e da 3ª pessoa sem diferença visual.

## 7. Coisas que NÃO são o problema (não reabrir sem número novo)

- **GPU**: 3,56 ms por quadro. Ociosa.
- **Sombra**: +5% ao desligar. Secundária.
- **DOM do HUD**: 12 mutações por segundo. Irrelevante.
- **Carregamento de asset em jogo**: zero requisições de `.glb` nos últimos 60 s de jogo.
- **`setInterval`/`setTimeout`/`MessageChannel`**: 0 ms por quadro.

## 8. Marcado como não verificado

- `[NÃO VERIFICADO]` `game-world.tsx:1909` — "até 6 `glbSurfaceY` por quadro, cada um com raycast de
  terreno". O `useFrame` existe na linha; a contagem de 6 raycasts veio da leitura estática do subagente
  e não foi cronometrada ao vivo.
- `[NÃO VERIFICADO]` O "TOP 10 desperdícios" de `r3-gpu-waste.md` é ordenação estática por contagem de
  ocorrência, sem medição de GPU por item. A medição de GPU acima contradiz a premissa dele: desperdício
  de GPU não é o que trava este jogo hoje.

## 6d. Item 3 — textura em KTX2 (FEITO, commit e64dbc0)

Piloto em 3 modelos. A fiacao ja existia (`ktx2-gltf.ts`) e so o chao usava.

| arquivo | disco antes | disco depois | VRAM antes | VRAM depois |
|---|---:|---:|---:|---:|
| red/hero-preview.glb (2048) | 8,17 MB | 1,92 MB | 16 MB | 4 MB |
| raiders/pirate.glb (2x1024) | 1,44 MB | 1,58 MB | 8 MB | 2 MB |
| crystal/crystal.glb (3x1024) | 9,39 MB | 6,84 MB | 12 MB | 3 MB |

Medido na cena viva: 5 texturas comprimidas, formato 36492 = BC7 (1 byte/px).
8 MB onde eram 32 MB em RGBA8. Sem mipmap na conta; com mipmap o fator 1,33
vale para os dois lados.

Qualidade (PSNR, KTX2 transcodificado de volta para RGBA8 e comparado ao
original): heroi 34,5 dB; cristal 35,2 (cor) / 39,6 e 45,9 (UASTC, nao-cor);
pirata 30,9 dB — o original do pirata ja era JPEG, parte do erro e dele.
Recorte 1:1 do atlas do heroi lado a lado: sem artefato de bloco visivel.

Cobertura de call-site conferida: os 3 GLB declaram `extensionsRequired:
KHR_texture_basisu`, ou seja, um carregamento SEM o KTX2Loader falha duro.
Os unicos pontos que carregam esses URLs sao `GlbHeroMixamo` (heroi por
`RED_URL` e pirata por `MIXAMO_RAIDER[raider_scout].url`) e `GlbCrystals` —
ambos fiados. `RAIDER_GLB` nao tem o pirata; `glb-hero.tsx` usa outro modelo.

Interacao com o corte de textura do celular: `capTextures`
(device-profile.ts:61) ja pulava `isCompressedTexture`. Entao no celular o
heroi deixa de cair para 1024. Nao e regressao: 2048 em BC7 = 4 MB, igual ao
1024 em RGBA8 que existia antes. `textureCapFor` nao mudou, e o teste
`perfil-aparelho.test.ts` continua valendo.

`src/test/resolucao-minima.test.ts` foi ajustado para ler largura/altura do
cabecalho KTX2 (offsets 20 e 24) e para seguir
`texture.extensions.KHR_texture_basisu.source`. A expectativa de 2048 px no
heroi continua a mesma — nao foi afrouxada.

Ferramenta nova: `tools/ktx2-glb.mjs` (ETC1S na cor, UASTC no nao-cor,
`--genmipmap`, backup do original antes de sobrescrever em `KTX2_BACKUP_DIR`).
Serve para os outros 86 GLB.

Suite: 913 passam. 2 falhas que nao sao desta mudanca — `dificuldade-mundo`
(CRLF, pre-existente) e `enfeites-no-seco` (timeout de 20 s so quando roda
junto; passa isolado, 136/136 com os afetados). `vite build` exit 0.

## 6e. Item 4 — malha em meshopt + cache dos modelos (FEITO)

### O que entrou

35 GLB **sem animacao** passaram para `EXT_meshopt_compression`:
**92,34 -> 58,70 MB** (-36%). O acervo inteiro sai de 180,38 para 146,74 MB.
Nao mexe em codigo: o `useGLTF` do drei ja liga o `MeshoptDecoder` sozinho, e
4 arquivos da casa ja rodavam assim em producao.

| arquivo | antes | depois |
|---|---:|---:|
| map/desert-palm-cluster.glb | 6,21 MB | 2,14 MB |
| trees/tree-split.glb | 5,74 MB | 1,99 MB |
| terrain/mountain.glb | 1,00 MB | 0,46 MB |

### Por que os 49 arquivos COM animacao ficaram de fora

Primeiro a conversao pegou os 84, e o acervo foi para 115,65 MB. Parecia melhor.
Medindo a animacao antes e depois, porem (HEAD cru contra arvore decodificada,
sampler por sampler, em todas as animacoes de cada arquivo):

- pior erro de **rotacao**: 0,82 grau (`ranger/UAL2_Standard.glb`);
- pior erro de **translacao**: 6,2 cm (`animals/buffalo.glb`), veado 3,1 cm,
  heroi 3,1 cm, civil 2,3 cm.

0,82 grau nao se ve. 6,2 cm de translacao de osso se ve: e pe deslizando,
corpo flutuando ou afundando. E o `withoutHipsMotion` so e aplicado ao clipe de
MORTE (`glb-hero-mixamo.tsx:287`) — nos outros clipes a translacao do quadril
vale. A perda nao vem do `quantize()` (que aqui so pega TEXCOORD, JOINTS,
WEIGHTS e COLOR): vem do proprio `EXT_meshopt_compression`, cujos dois metodos
sao lossy (`@gltf-transform/extensions` index.d.ts:909-912), sem opcao para
pular animacao. Como a extensao decide por bufferView e nao por tipo de dado, a
unica divisao possivel e por ARQUIVO.

Troca recusada: 24,55 MB a mais em troca de erro de animacao. Ficam 33,64 MB de
economia com fidelidade intacta.

### Prova

- Erro de animacao no que sobrou: **0,0000 grau**. Nenhum arquivo passou de
  0,5 grau nem de 5 mm.
- Caixa delimitadora, vertices, triangulos, animacoes, skins e nodes: iguais em
  todos os 35, comparados contra `HEAD`. Zero problema de caixa.
- 9 arquivos de cenario tem POSITION em `5122` (SHORT) em vez de float — mas
  **ja vinham assim do original**, conferido arquivo por arquivo contra `HEAD`.
  A ferramenta nao quantizou POSITION.
- Suite: **914 passam, 1 falha** (`dificuldade-mundo`, CRLF desta maquina,
  pre-existente). `vite build` exit 0.

### Armadilha que isso descobriu (vale para quem for comprimir de novo)

`src/test/mixamo-retarget.test.ts` e `src/test/morte-cai-no-chao.test.ts` leem o
GLB na mao, sem loader, e fazem `new Float32Array()` em cima do byte CRU do
bufferView. Com a animacao comprimida esses bytes viram lixo, o
`new THREE.AnimationClip('c', -1, tracks)` calcula duracao em cima do lixo e o
teste **roda para sempre** — nao falha, trava. Era isso que impedia a suite
inteira de fechar. Com a animacao fora da compressao os dois voltam a passar
sem precisar tocar em nenhum `expect`: 39/39 e 11/11. A suite inteira fecha em
166 s.

### Cache dos modelos

Antes, o `_headers` do build cobria so `/assets/*`: todo GLB era rebaixado a
cada visita. `nitro.config.ts` novo acrescenta `/models/**`:

```
/models/*
  cache-control: public, max-age=86400
```

**Sem `immutable`, e um dia em vez de um ano, de proposito.** Os arquivos em
`/assets/*` levam hash no nome (o Vite renomeia quando o conteudo muda), mas
`/models/fox.glb` nao. Com `immutable` por um ano, trocar um modelo deixaria
quem ja visitou com o antigo por um ano, sem jeito de forcar. Um dia ja corta o
re-download de toda visita. Se os modelos ganharem hash no nome, da para subir.

### Na tela

Mundo carregado: arvores, terreno, rochas e bicho nas proporcoes certas, nada
gigante. **38,6 FPS e 126 draw calls**, contra 30,0 FPS e 161 draw calls do
item 3. Requisicao de cada GLB em 200 com o tamanho exato do disco.

Ferramenta nova: `tools/meshopt-glb.mjs`, com portao de fidelidade embutido
(caixa delimitadora a 0,5%, vertices, triangulos, animacoes, skins, nodes e
KTX2) e backup do original em `MESHOPT_BACKUP_DIR` antes de sobrescrever.
