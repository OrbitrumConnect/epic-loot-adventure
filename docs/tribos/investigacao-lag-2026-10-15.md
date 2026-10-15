# Investigação de lag — 2026-10-15

> INVESTIGAÇÃO (não implementação). Nenhum código de produção foi alterado.
> `npx tsc --noEmit` = exit 0 ao fim. Branch `perf/lag-e-aberracao`.

## Como medi (ambiente e método)

- Servidor `npx vite dev` na porta 8000 (config `.claude/launch.json`, `tribos-dev`).
- **O painel do navegador fica oculto e congela o `requestAnimationFrame`.** Provei:
  um loop `requestAnimationFrame` rodou só **2 quadros em ~1 s**. Então NÃO dá pra
  medir com rAF natural. Avancei os quadros à mão por
  `const f = await import('/@id/@react-three/fiber'); f.advance(t)` com `t` crescente.
- Peguei o renderer vivo (`gl`) e a store do R3F por `f._roots` (Map, 1 root) →
  `root.store.getState().gl`. **Provei que é a instância viva**: `gl.info.render.frame`
  incrementa a cada `advance` (709 → 710 → 711). Não é instância paralela.
- **Contagens (draw calls, triângulos, geometrias, texturas, VRAM) são determinísticas**
  e confiáveis. **Tempo de quadro é RUIDOSO** neste ambiente (aba em background, GPU
  com prioridade reduzida, `readPixels` de sincronismo somando overhead): a mediana de
  baseline derivou entre 25 ms e 39 ms em leituras separadas, com p99 estourando 227 ms
  (GC/throttle). Por isso **atribuo custo por contagem de draw calls/triângulos por
  sistema** (reproduzível), e trato os tempos como ordem de grandeza, não valor fino.
- Para tempo usei `performance.now()` em volta de `advance` + `gl.readPixels(1px)`
  (força o CPU a esperar a GPU). Mede CPU+submit+parte da GPU, não o tempo de GPU puro.
- `window.__celStats` está **quebrado como fonte**: é um objeto de módulo PARALELO
  (HMR/StrictMode criou outra instância); os campos ficaram em 0 enquanto o cel-shade
  real rodava. Confirmei que o cel-shade RODA porque o total de draw calls por quadro
  (com `autoReset=false`) bate com cena+bloom(2)+quad(1). **Não confiar no `__celStats`
  por enquanto — é um bug de instrumentação, não de render.**

## 1. Baseline (medido)

Canvas **1090×457**, **DPR = 1** (buffer == client), `antialias:false`,
`shadows="percentage"`, cel-shade ON (bloom+céu; toon OFF).

| Métrica | Valor | Como medi |
|---|---|---|
| Draw calls, quadro normal | **~89–109** | `gl.info.render.calls` com `autoReset=false`+`reset()` por quadro |
| Draw calls, quadro COM sombra | **~391–392** | idem, no quadro em que o shadow map re-renderiza |
| Triângulos, quadro normal | **0,8M – 5,67M** (depende da vista) | `gl.info.render.triangles` idem |
| Triângulos, quadro COM sombra | **~9,28M** | idem |
| Geometrias (GPU) | **~264** | `gl.info.memory.geometries` |
| Texturas (GPU) | **~233** | `gl.info.memory.textures` |
| Programas (shaders) | **~62** | `gl.info.programs.length` |
| Meshes na cena | **5269** (4885 visíveis) | `scene.traverse` censo |
| Skinned meshes | **406** | censo |
| Instanced meshes | **48** | censo |
| Tempo de quadro CPU+GPU (readPixels sync) | **mediana ~25 ms, p90 ~32 ms, p99 ~60 ms** | loop `advance`+`readPixels`, 100 amostras (RUIDOSO) |

**Sobre os 2350 draw calls / 8M tris do Pedro:** hoje o quadro normal está em
**~89–109 draw calls**. O frustum culling do Pedro está cortando MUITO: dos 4885 meshes
visíveis, só ~90–110 passam o frustum da câmera. Os "2350" eram antes do culling e/ou
numa vista mais cheia. **O número de draw calls NÃO é mais o gargalo.** Os ~8M tris
reaparecem **só no quadro com sombra (9,28M)** e **em vistas com muita floresta**
(a árvore instanciada sozinha coloca ~2,4M tris em cena).

> ⚠️ Triângulos e draw calls variam MUITO com a vista da câmera (o jogo se move
> enquanto avanço quadros). 5,67M vs 0,8M é a mesma cena, câmeras diferentes. Medi em
> estado estável (depois de ~180 quadros de aquecimento pra GLB+material assentarem),
> mas a composição da vista é intrinsecamente variável.

## 2. Quem gasta — atribuição determinística (draw calls / triângulos renderizados)

Toggle no MESMO quadro (visible=false), contagem com `autoReset=false`. Vista com
~89 calls / 825k tris:

| Sistema desligado | Δ draw calls | Δ triângulos | Leitura |
|---|---|---|---|
| Criaturas skinned (406 meshes) | **−36 calls** (40%) | −209k tris | Dominam DRAW CALLS |
| Vegetação instanciada (48 meshes) | −16 calls | **−505k tris** (61%) | Dominam TRIÂNGULOS |
| Instanced grande (5 meshes, árvores) | −4 calls | −220k tris | Subconjunto da veg. |
| Shadow map (quando dispara) | **+283 calls / +3,6M tris** | passe inteiro da cena | Pico periódico |

Atribuição de tempo (RUIDOSA, ordem de grandeza, baseline ~34–39 ms nessa rodada):
sombras −5 ms (~13%), skinned −3 ms, instanced −3,5 ms. Dentro do ruído; **não tomar
como verdade fina** — ver limitação de ambiente acima.

### Por que os skinned pesam em draw call
Cada personagem GLB é **fatiado em vários submeshes skinned**: Peasant = Arms+Body+
Feet+Legs (4 draws/personagem), Ranger ~10–14 partes (braços, pernas, corpo, cintos,
ombreiras, capuz). 406 skinned meshes = ~70 criaturas, mas **cada criatura custa N
draw calls + N atualizações de skinning**, não 1. O Pedro já tira criaturas distantes
(>34²) do passe de sombra e pausa o mixer — isso ajuda o CPU, mas as partes visíveis
ainda somam draw calls.

### Sombras
`shadow.autoUpdate=false` + `needsUpdate` a 15 Hz está CORRETO e FUNCIONANDO (observei
o passe de sombra disparar ~1 a cada 5 quadros). Quando dispara, re-renderiza a cena
inteira dentro do volume 120×120 (shadow-camera −60..60): **+283 draw calls, +3,6M
tris** — não é frustum-culled pra vista, cobre a área toda. Já throttlado a −75%.
`gl.shadowMap.type=1` (PCF). 1 única luz com `castShadow` (direcional).

### Luzes
**18 point lights** na cena + 1 ambiente + 1 direcional. Só a direcional faz sombra.
Point light em forward rendering pesa no shader de cada material afetado mesmo sem
sombra. O Pedro já fez culling por distância; 18 ainda é bastante. (Não isolei o custo
por falta de um toggle barato no mesmo quadro — ver "não consegui medir".)

### Pós (cel-shade)
Roda por quadro: cena→RT (MSAA 4x) + bloom 2 passes (1/4 res) + quad de filtro
fullscreen. Custo próprio não isolável agora porque `__celStats` está quebrado
(instância paralela). Estruturalmente é 1 render de cena cheio + 3 passes fullscreen.

## 3. Memória de GPU e textura (medido — ACHADO Nº 1)

Censo de texturas únicas dos materiais da cena (`scene.traverse`, dedup por objeto):

| Resolução | Qtd | VRAM aprox. (RGBA8 + mipmaps ×1,33) |
|---|---|---|
| **4096×4096** | **15** | **~1,34 GB** |
| 2048×2048 | 28 | ~616 MB |
| 1024×1024 | 36 | ~201 MB |
| 512×512 | 16 | ~17 MB |
| resto (UI/labels 72px, 128×64, etc.) | ~56 | pequeno |
| **TOTAL estimado** | **151 únicas** | **~2,1 GB** |

As **15 texturas 4096²** são **5 materiais de PERSONAGEM × 3 mapas** (albedo+normal+
roughness cada): **Female_Peasant, Male_Peasant (raiders), Female_Ranger, Male_Ranger
(herói), defaultMaterial**. Ou seja: os modelos de herói e raider carregam PBR 4096².
Mesmo compartilhados entre instâncias (useGLTF cacheia), 4096² por tipo é exagero.

> Estimativa (não lei): assume RGBA8 sem compressão + mipmaps. É o caso real aqui —
> diário confirma que **KTX2/Basis NÃO está configurado** (texturas sobem cruas).
> Em GPU fraca, ~2,1 GB de textura = pressão de VRAM → thrashing → stutter.

GLBs grandes no disco (`public/models/`): container 36MB, wukong 21MB (SEM USO,
pendência de apagar), factory 18MB, tribal-bug 15MB, crystal 15MB, kaiju 14,5MB,
watchtower 13MB, loudspeaker 11MB, pheasant 10,6MB, insectoid 10,5MB, goose 9,6MB,
Imp 9,0MB. Animais somam ~68MB, raiders ~86MB, bosses ~64MB, ranger ~47MB.

## 4. O laço de quadro (medido — LIMPO)

- **41 corpos de `useFrame`** em 30 arquivos.
- **Zero alocação por quadro** detectada dentro deles: varri os 41 corpos com
  casamento de chaves e busquei `new THREE.*`, `.clone()`, `new Vector/Quaternion/
  Matrix/Color`. **Nenhum hit dentro de `useFrame`.** A disciplina do projeto está
  mantida.
- Ressalva: alocações escondidas em FUNÇÕES chamadas de dentro do `useFrame` (ex.: tick
  de IA em `hostile-ai.ts`, `raider.tsx`) não entram nessa varredura. Não as auditei
  linha a linha — ver "não consegui medir".

## Ranking por retorno sobre esforço

| # | Achado | Custo medido | Esforço | Risco de regressão | Retorno |
|---|---|---|---|---|---|
| 1 | **Texturas 4096² dos personagens** (15 tex, ~1,34 GB) | VRAM: ~1,34 GB de 2,1 GB totais | Médio: reexportar/compactar 5 materiais pra 1024² OU pipeline KTX2 (gltf-transform, já citado no diário como "maior ganho") | Baixo-médio: visual quase igual a 1024² num personagem em 3ª pessoa; KTX2 precisa de loader | **ALTÍSSIMO** — ~1,34 GB → ~84 MB (1024²) ou menos com KTX2 |
| 2 | **Triângulos da vegetação instanciada** (árvore 272×8868 = 2,4M tris) | até 61% dos tris em vista de floresta | Médio: LOD (`<Detailed>`) ou geometria de árvore mais leve/impostor à distância | Médio: mexer na silhueta da floresta (Pedro curte o visual) | Alto em vistas de floresta |
| 3 | **Passe de sombra cobre volume 120×120** (+283 calls/+3,6M tris quando dispara) | pico periódico a 15 Hz | Baixo-médio: reduzir shadow-camera (ex.: 40×40 perto do jogador) OU baixar freq. ainda mais em cenas estáticas | Baixo: sombra só perto já basta visualmente | Médio |
| 4 | **Submeshes skinned por personagem** (4–14 draws/criatura, 406 total) | 40% dos draw calls | Alto: fundir submeshes de um MESMO personagem num skinned mesh por material (mantém 1 skeleton) | Médio: precisa cuidado com a hierarquia de ossos | Médio |
| 5 | **18 point lights** forward | não isolado | Baixo: reduzir nº simultâneo / raio / `decay` | Baixo | Médio (a confirmar) |
| 6 | **Instrumentação `__celStats` quebrada** | custo do pós não medível | Baixo: garantir handle único (sem instância paralela) | Nenhum (só dev) | Habilita medir o pós |

### Sobre fundir malhas (achado #4) — a ressalva do Pedro
O Pedro registrou que personagem e criaturas são **malhas animadas independentes** e
que fundir QUEBRARIA a animação. Correto PARA criaturas diferentes (skeletons
diferentes). **Mas** dentro de UM personagem, as 4–14 partes skinned compartilham
**o MESMO skeleton** (Arms/Body/Legs do mesmo Peasant). Fundir só as partes de MESMO
material DENTRO do mesmo personagem (merge de geometria preservando skinIndex/
skinWeight e apontando pro mesmo skeleton) reduz draw calls **sem** fundir criaturas
distintas nem trocar o esqueleto. Não é `BatchedMesh` entre criaturas — é merge
intra-personagem. Esforço real e com risco; por isso está em #4, não no topo.

## Recomendação ordenada (retorno / esforço)

1. **Compactar/reduzir as 5 texturas 4096² dos personagens** (→1024² ou KTX2). Maior
   ganho de VRAM de longe (~1,34 GB), risco baixo, não toca lógica de jogo. Começa aqui.
2. **Apagar `wukong.glb` (21MB)** — pendência já aberta, sem uso.
3. **Encolher o volume da shadow-camera** pra perto do jogador (corta o +3,6M tris do
   passe de sombra sem perder sombra visível).
4. **LOD/impostor na floresta** à distância (corta os ~2,4M tris da árvore instanciada).
5. **Rever as 18 point lights** (nº/raio/decay).
6. **Consertar a instância paralela do `__celStats`** pra poder medir o pós de verdade.
7. (Maior, depois) merge intra-personagem das partes skinned de mesmo material.

## O que NÃO consegui medir (e por quê)

- **Tempo de GPU puro e atribuição fina de ms por sistema**: aba em background com rAF
  congelado + GPU throttled + overhead do `readPixels`. Baseline derivou 25→39 ms entre
  leituras; p99 estourou 227 ms. Deltas de toggle ficaram dentro do ruído. Para número
  confiável de ms: medir com a aba REAL em foco (rAF vivo) e `EXT_disjoint_timer_query`,
  ou o profiler de GPU do Chrome — fora do meu alcance neste painel oculto.
- **Custo isolado do pós cel-shade** (`composerMs`/`postMs`): `window.__celStats` aponta
  pra uma instância de módulo paralela (HMR); fica em 0 enquanto o render real roda.
- **Custo isolado das 18 point lights**: não há toggle barato no mesmo quadro sem mexer
  no código; apagá-las muda o shading e recompila material (contamina a comparação).
- **Alocação por quadro dentro de funções chamadas pelo `useFrame`** (ticks de IA em
  `hostile-ai.ts`/`raider.tsx`): a varredura cobre só os corpos literais de `useFrame`.
- **GLBs carregados simultaneamente por rede**: o buffer de `performance.resource` só
  tinha os imports de URL (fetches já evictados). Inferi os carregados pelo censo da
  cena (herói+raiders+criaturas+props da base) e pelos tamanhos em disco.
