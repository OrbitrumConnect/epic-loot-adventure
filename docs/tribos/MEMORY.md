# MEMÓRIA

## TRIBOS — projeto em foco

- [**🧭 LEITURA CENTRAL — MUNDO PÓS-COLAPSO**](tribos-visao-pos-colapso.md) — DIREÇÃO OFICIAL (selada 07/10). Sobrevivência + reconstrução de civilização; infraestrutura sobreviveu, civilização não. Combate/raid/base SERVEM essa fantasia. Lente que afia o Mestre — passar toda prioridade por aqui.
- [**DOCUMENTO MESTRE SELADO**](tribos-documento-mestre.md) — LER PRIMEIRO. 96 seções, 16 blocos, 14 fases (A–N), 15 pilares. Mundo multiplayer persistente: exploração+PvP+PvE+base+raid+guerra. Repo: epic-loot-adventure.
- [Visão arquitetural + Diagnóstico](tribos-visao.md) — Estado do código (530 linhas em 3 arquivos), 16 problemas diagnosticados, arquitetura alvo (types→data→systems→store→UI→render), 3 etapas de evolução.
- [Modo de trabalho](tribos-modo-de-trabalho.md) — Diário todo dia, escopo fechado TRIBOS, ordem dos blocos é lei, refinar≠trocar, filtro §95, não force push (Lovable).
- [Monetização](tribos-monetizacao.md) — F2P, diamantes, skins/pets/cosméticos, Pix via Google Play, sem P2W, sem saque. 3 camadas (mundial/tribo/premium).
- [Sistema de câmera](tribos-camera-system.md) — Yaw/pitch próprio, Pointer Lock, WASD relativo à câmera, collision, zoom, transição suave. Space=PULO, click=ATTACK. PRÓXIMO.
- [Mapa global (M)](tribos-mapa-global.md) — M abre hub de gestão (base, raids, inventário, personagem). Invencível no mapa. Mundo 3D limpo pra gameplay.
- [**3 Camadas**](tribos-3-camadas.md) — TRIBOS = 3 jogos em 1: Mapa Aberto (survival/farm), Raid (MOBA/arena), Base (builder/Clash). Loop: Base→Mapa→Raid→Base.
- [**Tribo + Base Comum**](tribos-tribo-base-comum.md) — SELADA 07/10: solo tem base própria; formar tribo soma recursos → UMA base comum em nova localidade, tier escolhido pelo pool. Alvo da raid.
- [**Nível não é porta**](tribos-nivel-nao-e-porta.md) — SELADA 07/10: nível = preparo, não porta. Sem level-gate (overworld/raid). Geografia define o perigo; instância adapta a FORMA da ameaça, nunca a IDENTIDADE. Overworld compartilhado, sem level-scaling individual.
- [**Direção visual: personagem articulado**](tribos-visual-articulado.md) — SELADA 08/10: separar gameplay×visual (= asset-swap); articular personagem (cotovelo/joelho) com rig hierárquico (não skinned); REGRA do orçamento de performance. Ordem: personagem → camada visual/registry → polimento.
- [**Weapon System + CombatController**](tribos-weapon-combat-system.md) — SELADA 08/10: arma = dado (data-driven); CombatController compartilhado (humano E idle); ranged primeiro arco/pistola/rifle; LMB primário/RMB mira/Q-R especiais. Melee atual INTACTO. Mapa de raid = ciclo depois.
- [Equipe](tribos-equipe.md) — Pedro (criador/design) + Caio (dev, entrou 06/10). Handoff no diário 06/10.

- [Cidade / Base (visão de cima)](tribos-cidade.md) — Camada 3. Cidade isométrica em sprites, 8 construções × 20 níveis, filas de construção e produção, expedições. Assets em `art/city/`. Sessão 4 (Caio).
- [Acampamentos + Objetivos (idle/manual)](tribos-acampamentos-objetivos.md) — Acampamentos inimigos no mapa, fila de objetivos por clique, piloto automático. Sessão 5 (Caio, 07/10).
- [Progressão, coleta e combate visual](tribos-progressao-combate.md) — Níveis e XP por criatura, 276 nós de colheita com ferramenta, 28 sprites de item, arma na mão, transparência por oclusão, dano/sangue/barras na tela. Sessões 6-7 (Caio, 07/10).
- [Base persistente (Fase 3)](tribos-base-persistente.md) — Claim no grid, construção por arrasto, perímetro fechado destrava a cidade. Uma base, duas vistas. Tecla `N`. Sessão 09/10 (Caio).
- [**Raid/Guerra (Camada 2)**](tribos-raid-guerra.md) — SELADA 09/10: loop estilo Clash (dano físico + saque, x% = sucesso, ~5 ondas pra wipe, escudo/ondas). Raid ESCOPADA à base (snapshot offline / live online), NÃO exércitos no mundo todo. Guerra no mapa 2D + base em chamas no 3D. Raid custa recurso e tem que render. **Multi-tribo (Fase M):** terceiros entram no raid (aliar/atacar o atacante/abutre); escopado à base, online.
- [**Construção da 1ª base**](tribos-base-construcao.md) — SELADO 09/10: build manual único no open world + barra %, **layout Lv1 PADRONIZADO** (consolida o que ergueu). Coleta→armazém→upgrade Clash. Mochila (peso) vs baú base (raidável) vs cofre (futuro). Cama=coração (wipe perde base, personagem sobrevive). Uma base, 3 vistas; raid instanciado; base privada.
- [**Mundo pós-solar + guia visual**](tribos-mundo-pos-solar.md) — Direção nova (Caio, 10/10): labareda solar, 3% sobreviventes, dominar fábrica/bunker/aeroporto dá lucro, PvP por lanes, cidade farmada em template. **40 amostras visuais em [guia-visual.html](guia-visual.html)**.
- **Fluxo git:** Caio trabalha no fork `caiolea0/epic-loot-adventure` e manda PR pro `OrbitrumConnect`. Sem force push.
- **Pipelines de arte:** `art/city/` (160 sprites de construção, 20 níveis × 8) e `art/items/` (28 sprites de item). Ambos regeneráveis: Codex com `gpt-5.6-luna` esforço médio, sheets 2×2, recorte por script. Sheets brutas fora do git.
- **Subagentes do projeto** (em `~/.claude/agents/`, fora do repo): `tribos-game-systems`, `tribos-world-3d`, `tribos-hud` — todos `claude-sonnet-5-5`, esforço médio, cada um com as regras duras do seu escopo.

- [**🔊 Sistema de Áudio (referência)**](audio-sistema.md) — JÁ QUEBROU 2×: sync de snapshot gutou o `audio-manager` (removeu passos/melee/harvest/gun, trocou `shot` flecha→tiro, apagou .wav). Doc lista **arquivos + métodos + onde cada som é chamado** (game-store: arco=flecha/pistola-rifle=tiro/melee; game-world: passos; harvestAt: coleta) + checklist de restauração. **Não remover num sync.** Commit bom: `ad7bc6c`.

## Feedback

- **Diário e memória sempre (Caio, 06/10)** — atualizar diário do dia e este índice a cada etapa: o que foi feito, conclusões, achados. Só adicionar.

- [Não apagar conteúdo](feedback-nao-apagar-conteudo.md) — quando Pedro pede pra editar algo, SÓ adicionar o que pediu; nunca reescrever/apagar o resto sem perguntar antes.
- [Começar pela memória](feedback-comecar-pela-memoria.md) — tudo já está mapeado (diário/checklist). NÃO re-explorar codebase nem usar subagents pra redescobrir. Ler memória primeiro. Economiza token.

## Diários TRIBOS (`diarios/`)

> Correção: a pasta é `docs/tribos/diarios/`. Os links `diarios-tribos/` abaixo estão quebrados desde o começo.

- [**🎮 VISÃO MASTER PLAY + checklist (31/10)**](visao-master-play.md) — onde estamos (migração Fases 0–4 ✅), loop do dia, quadro de missões MIR4 sobre a fila do piloto, hordas +5 min na Zona Sul, nível carro/skate, base elite (13 + torres de perímetro + modo livre), botões do carro no celular, ordem e checklist. Nada codado.
- [2026-10-31](diarios/2026-10-31.md) — **CAVERNA** do Rebouças (salão do chefe, saídas Leblon e Laranjeiras, 13 inimigos, cristal leve), sair do carro no ar, acampamentos armados nos topos (Sumaré/Horto/Gávea/Rocinha), bug antigo da silhueta cobrindo o herói, lockfile Cloudflare. **Seção 6: o sentido que o jogo está tomando** (mapa disparou; falta o loop base/raid na Zona Sul → Fase 4).
- 2026-10-25 a 2026-10-30 — ver a pasta `diarios/` (29/10: a Zona Sul vira o mapa oficial; 30/10: lag, Sorriso, PR #14 do Caio).
- [2026-10-24](diarios/2026-10-24.md) — Mapa: +30% de verde só na parte plana (manchas novas, não repinta as velhas).
- [2026-10-23](diarios/2026-10-23.md) — **Abertura + LISTA do que falta (em ordem).** Incidente: save do Pedro (nv 38) recusado por base em MEIA célula → corrigido sem perda (conta protegida). Auto: ponto de partida + horda volta pra base; joystick desliga o auto. Tropas investigadas (sem uso hoje). 643 testes.
- [2026-10-22](diarios/2026-10-22.md) — **Dia longo:** online (tiro do convidado, arma do outro, poderes 5 s), save do progresso da base (casa de metal), contas com DONO por aparelho, login leve (mundo 3D só após login), mira 3ª pessoa igual CS, anims PvP (strafe/golpe/gesto/combo), raid (torre clicável + torre atira em jogador), escada/2º andar das casas, quem te matou, piloto (bolsa cheia, fila), bichos +10% e renascem mais rápido, mapa mais verde, PWA, VRAM.
- [2026-10-21](diarios/2026-10-21.md) — PvP fatias 1–4, aba Salas, mobile (joystick/rodapé), progresso na conta, horda do convidado, armaduras do Caio.

- [2026-10-20](diarios/2026-10-20.md) — **Integração do mapa novo em GLB (`rio-wasteland`):** infra `glbSurfaceY` + `useTerrainVersion` (terrain-collision) → **todos os props/player/bichos assentam no relevo do GLB** (sobem/descem vales/rio). Mapa **fixo no código** (`map-floor.tsx`) p/ deploy Vercel/mobile (Editor = só localStorage); GLB liberado do gitignore; textura **2048** (~17MB). Cena ajustada por toggles: chão antigo/ponte/estrada/água antiga/maze fixo/containers OFF; **água** = plano nível −2.0 (aparece só onde o GLB afunda = lago + praias). **Camps movidos** (stonefist e outpost caíam em montanha/água). **Mapeamento por textura** (água azul central ~0, verde ~zero). Editor usável (gizmo onMouseUp, Snap ao chão, pan, foca-ao-selecionar). **Farm intacto** (getDistance 2D, grounding não afeta). **280 testes verdes.** Pendências: rio-fantasma/lag em (62,71), peso de grama/palmeiras, raid além da onda 12, Supabase p/ Editor.
- [2026-10-19](diarios/2026-10-19.md) — **Troca da skin do herói (`hero-preview.glb`):** novo GLB veio do **Blender** (raiz escala 0.01, Y-up) vs. os que funcionam em **FBX2glTF** (escala 1). Quebrou tamanho (escala assada no bind que o skinning ignora mas o bounding box não), arma (osso da mão 100× menor) e plantio (clips do esqueleto antigo com `Hips.Y` que afundava 1.09 m). Fix **só em `glb-hero-mixamo.tsx`**, gated ao modelo "fooled" (zero regressão nos raiders/bichos): `measureSkinnedBox` (caixa real pós-esqueleto), `gripNorm` pela escala do osso, e `stripRootMotion` fixando `Hips.Y` no bind. Medido headless no three (fonte da verdade, não chute): pés em y=0, 1.944 m. **280 testes verdes.** Pendências: jacaré invisível online (asset no deploy), troca de mapa (GLBs novos + remover terrenos), **sem git nesta pasta** (snapshot).
- [2026-10-09](diarios/2026-10-09.md) — **Sessão 9 (cont.), dia cheio:** trigger do piloto + triggers no rodapé (abaixo do AUTO ON, sem crescer a barra) · minimapa/título menores (clamp) · **boss ataca de verdade + giro com cooldown 5s** · dia/noite + luzes +10% + **lua** · **MAX_LEVEL 30→250** (curvas desacopladas, 1–30 idênticos) · **skill points** (distribuição manual) · **Fase 7 economia de loot** (raridade por marco de valor + diminishing; itens épico/mítico novos) · fix tecla **M** (abre mapa) + **touch gira câmera** no 3ª pessoa · **sidebar esconde/mostra**. **Merge com o Caio:** adotada a **Fase 3 base persistente** (claim/construção/perímetro→cidade) + **crit/gear** dele; mantida minha luz noturna. **212 testes verdes**, build limpo, zero regressão.
- [2026-10-08](diarios/2026-10-08.md) — **Sessão 9 (Pedro+Opus), dia grande:** polish (fogueira acesa+brasa, hit reaction) · Weapon System data-driven + ranged (arco/pistola/rifle no fim da hotbar, 8 slots originais intactos) · especiais Q/R (salto/giro em área, cooldown por nível) · personagem articulado (cotovelo/joelho/ombro/quadril) · **deploy Vercel** (epic-loot-adventure.vercel.app) · luz noturna +20% · fixes mobile (hotbar wrap, barra inferior some com modal aberto) · **progressão escalável: `attributesSystem` — nível+equip alimentam os 4 atributos 0–100% (dano/destreza/capacidade/velocidade), ligados ponta a ponta, zero regressão**. 149 testes verdes, build limpo. Supabase ainda NÃO conectado (Fase 10).
- [2026-10-07](diarios/2026-10-07.md) — Sessões 5-7 (Caio) + **Sessão 8 (Pedro+Opus)**. S5-7: acampamentos, objetivos, progressão, coleta, sprites, combate visual (PR #1/#2). S8: relevo+córrego+ponte, dia/noite, colisão seletiva, câmera (zoom+colisão), tecla E, iluminação noturna, caça por raio+sprint, tocha de fogo+impacto. Visão selada (pós-colapso, nível não é porta, tribo+base comum). 136 testes, build limpo.
- [2026-10-06](diarios/2026-10-06.md) — Sessões 1-4. Blocos 1 e 2 (refatoração, movimento, câmera) e a visão de cidade com 160 sprites.

### Links antigos (mantidos como estavam)

- [2026-10-06](diarios-tribos/2026-10-06.md) — Sessões 1-3. Bloco 1 COMPLETO (refatoração: types+data+systems+store). Bloco 2 ~60% (terreno, walk, jump, câmera iso/third, attack fix). 17 arquivos criados, 0 erros TS.

## Orbitrum Connect — projeto ativo (repo: orbitrumexpopro / OrbitrumProConnect)

> Nota (Caio, 07/10): este bloco é de **outro projeto**. Nenhum dos arquivos abaixo existe neste
> repositório — os links estão todos quebrados aqui. Mantido como estava, mas quem chega procurando
> TRIBOS deve parar na seção de cima. Os dois arquivos de feedback citados mais acima
> (`feedback-nao-apagar-conteudo.md`, `feedback-comecar-pela-memoria.md`) também não existem aqui.

- [**🚀 HANDOFF — LEIA ANTES DE TUDO**](diarios/2026-10-06.md) — topo do diário 06/10: ordem de leitura, regras duras, estado atual, próximo a atacar, economia de token. Ponto de partida de qualquer instância nova.
- [**DOCUMENTO MESTRE SELADO**](orbitrum-documento-mestre.md) — LER PRIMEIRO. Constituição do Produto (02/10/2026): 113 seções, 35 princípios. Fonte definitiva.
- [**Checklist CONSOLIDADO**](orbitrum-checklist.md) — 173 done / 41 pending (~81%). Auditoria app-wide (seção 19) + convergência 3 caminhos. Repo `docs/orbitrum/orbitrum-checklist.md`.
- [**Visão Consolidada**](orbitrum-visao-consolidada.md) — versão acessível do Mestre (33 seções, 18 princípios). ~70% implementado.
- [Modo de trabalho](orbitrum-modo-de-trabalho.md) — diário todo dia; escopo fechado Orbitrum; seguir sem pedir menu; localhost:3000.
- [Deploy + Conexões](orbitrum-deploy.md) — **Vercel ouve `proconnect`, NÃO `origin`!** Push `proconnect main` pra deploy. 9 env vars, DNS Cloudflare, orbitrum.com.br.
- [Planos e Free Plan](orbitrum-planos-decisao.md) — Nomes (Explorar/Conectar/Pro/Elite), limites Free (3B), indicação≠plano. Decisão 06/10.
- [Preservar o existente](orbitrum-preservar-existente.md) — REGRA DURA: nunca remover/trocar; só ADICIONAR. Confirmar antes de mudança estrutural.
- [Visão do sistema](orbitrum-visao.md) — Definição, fato relacional, loop, princípios inegociáveis.
- [Monetização](orbitrum-monetizacao.md) — Bloco C FROZEN. Reward ≠ cashback. Saque só Orbit Reward por resultado elegível.
- [Agentes + Worker](orbitrum-agentes.md) — Orbitrum = camada de contexto, NÃO uma IA. Fase F.
- [Parecer jurídico](orbitrum-parecer-juridico.md) — LGPD validada; legal hardening antes do lançamento público.

### Diários Orbitrum (`diarios/`, um por dia)
- [2026-10-06](diarios/2026-10-06.md) — Sessões 20-24. Checklist consolidado, auditoria app-wide, 506→260 erros TS, Free Plan 3B, portfolio Supabase, like/curtir.
- [2026-10-05](diarios/2026-10-05.md) — PRODUÇÃO ONLINE. DATABASE_URL fix. Bilateral 100% em produção.
- [2026-10-04](diarios/2026-10-04.md) — Bilateral E2E (12 bugs), reputação, agendamento, Missões.
- [2026-10-03](diarios/2026-10-03.md) — Auth, cadastro real, paleta, admin, termos/privacidade.
- [2026-10-02](diarios/2026-10-02.md) — Doc Mestre selado, Fase B, deploy Vercel.
- [2026-10-01](diarios/2026-10-01.md) — Bilateral, chat, economia, Agent API, Worker, parecer jurídico.
- [2026-09-30](diarios/2026-09-30.md) — Dashboards, paleta navy, funil cadastro.
- [2026-09-29](diarios/2026-09-29.md) — Retomada, Supabase novo, fatos relacionais.
