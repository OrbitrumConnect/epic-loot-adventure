# TRIBOS — Mapa de Realtime & Performance (fluido, sem lag)

Escrito para: Pedro + Caio (quem for executar a otimização).
Data: 21/10/2026. Regra-mãe do Pedro: **NÃO tirar grama/arte pra ganhar FPS** — achar o
gargalo, medir, preservar a direção visual. Tudo abaixo é aditivo/reversível e preserva o solo.

Stack confirmado: React Three Fiber 9 + three ^0.186 + drei; estado Zustand; rede Supabase
Realtime (Broadcast + Presence). Canvas atual: `shadows="percentage" dpr={1} performance={{min:0.5}}
antialias:false`.

São **duas frentes independentes**: (A) CLIENTE/RENDER (FPS/frametime no aparelho) e
(B) REDE/MULTIPLAYER (lag de sincronização). Lag visual de rede ≠ FPS baixo — tratar separado.

---

## A) CLIENTE / RENDER — FPS e fluidez

### A1. Oclusão da grama varre 62k instâncias por frame à toa — CONFIRMADO ⭐ (prioridade 1)
`ground-cover.tsx:8` passa `spheres: FadeSphere[] = []` (VAZIO) ao `ForestBatch` (`:69`), que
registra o lote no sistema de oclusão. `occlusion.ts:updateOcclusion` (≈:253) percorre **todas**
as instâncias de cada lote por quadro (até `GRASS_CAP` ~62k tufos) calculando distância e
opacidade — mas com `spheres=[]` o teste interno nunca ocorre, então é trabalho 100% inútil.
- **Fix:** não registrar lote com `spheres.length === 0` (em `ForestBatch`/`registerInstancedFade`).
  A grama não precisa de fade por oclusão (quem esconde o herói são árvores/pedras).
- **Risco:** baixo/reversível. Validar que árvores/pedras seguem com fade.
- **Medir:** `occlusionStats.ms`/`tested` antes/depois; frametime p95 no mobile.

### A2. VRAM: texturas descomprimidas somam GB — CONFIRMADO ⭐ (prioridade alta)
Nenhum GLB usa compressão de GPU (KTX2/Basis) → toda textura vira RGBA cru + mipmaps na VRAM.
Medido (dimensão real das imagens):
- `red/hero-preview.glb` (modelo do herói, no boot): **1× 4096² ≈ 85 MB** — superdimensionado.
- Cada inimigo/raider: 2–4× 2048² = **43–85 MB cada** → nas ondas somam rápido (vários na cena).
- `watchtower`/`crystal`/`Imp`/`puglin`/`loudspeaker`: 2048²×3-4 (~64–85 MB cada).
- `props/container.glb`: 3× 4096² = **255 MB** → **JÁ RESOLVIDO** (não carrega com COUNT=0, commit).
- Mapa `rio-wasteland-iconic`: 2× 2048² (~43 MB, ok).
- **Fix:** (1) **downscale** 4K→1–2K em personagens/props (hero-preview 4096→1024 = 85→~5 MB);
  (2) **KTX2/Basis** (`gltf-transform uastc/etc1s` + `KTX2Loader`/drei) → corta VRAM **~6×**.
- **Risco:** médio (reprocessa binário do asset). Fazer 1 por vez, conferir no jogo.
- **Medir:** VRAM da GPU (DevTools/so), antes/depois no PC do Caio.

### A3. Pós-processamento (cel-shade) — MEDIR antes de mexer
`cel-shade.tsx`: renderiza a cena num render target (`samples:4`) + textura de profundidade +
passe fullscreen + bloom opcional. Pode custar caro no celular (fillrate).
- **Fix candidato:** A/B (pipeline completo vs bloom off vs resolução interna reduzida); descartar
  render targets ao redimensionar; checar material de shader descartado no cleanup (possível leak).
- **Risco:** médio (mexe na identidade visual) — por perfil, não global. NÃO desligar às cegas.

### A4. Qualidade adaptativa por aparelho — NÃO EXISTE (prioridade média)
`dpr={1}` e `performance={{min:0.5}}` **não reduzem resolução sozinhos** no R3F — precisa reagir a
`performance.current`. Hoje todo aparelho renderiza igual.
- **Fix:** perfis (Performance / Equilibrado / Qualidade) no Zustand (persistidos localmente,
  NÃO sincronizados): resolução interna (DPR) adaptativa com **histerese** (baixa após queda
  sustentada, recupera devagar), sombras e efeitos por perfil. Preservar grama perto do herói.

### A5. LOD/culling da vegetação (prioridade média)
62k tufos (16 lâminas × 5 segmentos). Instancing corta draw calls mas não o custo de vértices/
overdraw/sombra.
- **Fix:** LOD por distância (tufo completo perto → geometria simples → impostor longe), vento
  mais sutil à distância, frustum/distância culling por setor. Sem deixar o mundo pelado.

### A6. Boot / carregamento (prioridade média)
~231 MB de GLB montam no boot; `/models/*` sem `Cache-Control` longo (só `/assets/*` pega). Alguns
pesos já otimizados (ponte 34→1.7MB, coqueiros 161→6.3MB).
- **Fix:** continuar comprimindo os GLB grandes; carregar por região/distância; cache longo nos
  `/models/*` no deploy; tela inicial funcional enquanto carrega o essencial.

---

## B) REDE / MULTIPLAYER — lag de sincronização

Arquitetura: `src/net/multiplayer.ts`. Host = quem cria a sala (autoridade dos inimigos).
Poses de players por Broadcast ~11Hz (interpoladas no `remote-players`); snapshot do mundo
(criaturas) pelo host a cada 450 ms; PvP por `player-hit`; `eventsPerSecond: 24`.

### B1. Criaturas do convidado sem interpolação — CONFIRMADO ⭐ (prioridade 1 do realtime)
`world-entities.tsx`: o convidado faz `useGameStore.setState({ creatures: remoteWorld })` direto
a cada snapshot (450 ms) → os bichos **teleportam** de 450 em 450 ms (travadão). É o "vejo o bicho
longe que o amigo já matou"/andar aos trancos.
- **Fix:** interpolar as posições das criaturas no convidado entre snapshots (como já é feito com
  os players remotos: lerp por frame). Guardar `targetPos` por criatura e suavizar no `useFrame`.
- **Risco:** baixo/médio (só o convidado; host e solo intactos).

### B2. Snapshot FULL a cada 450 ms — CONFIRMADO (prioridade média)
`broadcastWorld` manda o **array inteiro** de criaturas a cada 450 ms. Conforme o mundo cresce
(ondas), o payload e o custo de serializar/aplicar sobem; o Supabase cobra por evento ENTREGUE
(fan-out pros 8).
- **Fix:** snapshot **incremental/delta** (só quem mudou) + campos enxutos (id, x, z, hp, estado)
  + quantizar números; manter a autoridade no host. Medir tamanho médio antes.

### B3. Poses dos players (OK, revisar frequência)
11 Hz por player, interpolado — bom. Com 8 players o fan-out multiplica (8×7 entregas). Medir o
tráfego real; se preciso, baixar a taxa com interpolação mais forte (qualidade visual local
independe da taxa de rede).

### B4. Host não congela mais em background — FEITO
`BackgroundSim` mantém `tickWorld`+torres por `setInterval` quando a aba esconde → o host segue
alimentando o broadcast (menos "bicho fantasma"). Já no main.

### B5. PvP (fogo amigo) — FEITO, validar a 2 dispositivos
`player-hit` entregue só ao alvo e só com inimizade. Precisa teste ao vivo (2 clientes) de
latência/consistência.

---

## C) SUPABASE

- **Auth**: login nome+email+senha, `mailer_autoconfirm=true` (sem confirmação). OK.
- **Persistência**: `player_saves` (RLS do dono), debounce. Validar entre 2 dispositivos.
- **Lobby**: `game_rooms` (RLS: SELECT público, INSERT/UPDATE/DELETE do dono). Host registra +
  heartbeat 15 s; `listRooms()` < 60 s. **A fazer:** limpeza de salas órfãs (heartbeat vencido)
  por job/limpeza no cliente; hoje some da lista por `last_active_at`, mas a linha fica.
- **Realtime (custo)**: eventos são cobrados por entrega ao assinante. Pontos de pressão:
  snapshot full (B2) + poses ×fan-out (B3). **Medir** mensagens/seg e bytes antes de escalar o
  nº de salas/jogadores. `eventsPerSecond: 24` no client.
- **Env**: `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (anon pública; service_role/PAT nunca
  no cliente/commit). Ver `reference-supabase-config` na memória.

---

## D) MEDIÇÃO (transversal — fazer cedo pra validar tudo)

- **Painel de métricas** no jogo: FPS, frametime p50/p95/p99, draw calls, triângulos, instâncias
  visíveis, tempo de `updateOcclusion`, tempo do pós-processamento, nº de entidades, tamanho/seg
  dos pacotes de rede. (Já há `occlusionStats` e stats do cel-shade + `?stats` da drei opt-in.)
- **Cena de benchmark reproduzível**: mesma área (grama densa + árvores + combate com N bichos +
  noite), mesma câmera, mesma duração → comparar ANTES/DEPOIS de cada mudança. Uma mudança por vez.
- **FPS real nunca foi medido** nesta sessão (o rAF congela com o painel oculto). Precisa olho
  humano / device real (Caio).

---

## Ordem de ataque sugerida (impacto × risco)

1. **A1** oclusão da grama (vazio) — baixo risco, mobile sente. ⭐
2. **B1** interpolar criaturas no convidado — resolve o lag visual do multiplayer. ⭐
3. **A2** VRAM: downscale hero-preview 4K→1K + começar KTX2 — corta o pico de GPU do Caio. ⭐
4. **D** painel de métricas + cena de benchmark — pra validar o resto com número.
5. **A4** qualidade adaptativa (perfis + resolução) com histerese.
6. **B2** snapshot incremental de criaturas.
7. **A3/A5** cel-shade A/B + LOD vegetação.
8. **A6/C** boot/cache + limpeza de salas órfãs.

Itens 1–3 são os de maior retorno imediato e baixo risco. Nada aqui remove arte; tudo é medido e
reversível.
