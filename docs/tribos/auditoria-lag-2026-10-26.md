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
| 2 | Cortar alocação por quadro (vetores/arrays reaproveitados) nos 10 piores | ver `r1-perframe.md` | fim das tarefas longas de GC |
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
