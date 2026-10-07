# MEMÓRIA

## TRIBOS — projeto em foco

- [**DOCUMENTO MESTRE SELADO**](tribos-documento-mestre.md) — LER PRIMEIRO. 96 seções, 16 blocos, 14 fases (A–N), 15 pilares. Mundo multiplayer persistente: exploração+PvP+PvE+base+raid+guerra. Repo: epic-loot-adventure.
- [Visão arquitetural + Diagnóstico](tribos-visao.md) — Estado do código (530 linhas em 3 arquivos), 16 problemas diagnosticados, arquitetura alvo (types→data→systems→store→UI→render), 3 etapas de evolução.
- [Modo de trabalho](tribos-modo-de-trabalho.md) — Diário todo dia, escopo fechado TRIBOS, ordem dos blocos é lei, refinar≠trocar, filtro §95, não force push (Lovable).
- [Monetização](tribos-monetizacao.md) — F2P, diamantes, skins/pets/cosméticos, Pix via Google Play, sem P2W, sem saque. 3 camadas (mundial/tribo/premium).
- [Sistema de câmera](tribos-camera-system.md) — Yaw/pitch próprio, Pointer Lock, WASD relativo à câmera, collision, zoom, transição suave. Space=PULO, click=ATTACK. PRÓXIMO.
- [Mapa global (M)](tribos-mapa-global.md) — M abre hub de gestão (base, raids, inventário, personagem). Invencível no mapa. Mundo 3D limpo pra gameplay.
- [**3 Camadas**](tribos-3-camadas.md) — TRIBOS = 3 jogos em 1: Mapa Aberto (survival/farm), Raid (MOBA/arena), Base (builder/Clash). Loop: Base→Mapa→Raid→Base.
- [Equipe](tribos-equipe.md) — Pedro (criador/design) + Caio (dev, entrou 06/10). Handoff no diário 06/10.

- [Cidade / Base (visão de cima)](tribos-cidade.md) — Camada 3. Cidade isométrica em sprites, 8 construções × 20 níveis, filas de construção e produção, expedições. Assets em `art/city/`. Sessão 4 (Caio).
- [Acampamentos + Objetivos (idle/manual)](tribos-acampamentos-objetivos.md) — Acampamentos inimigos no mapa, fila de objetivos por clique, piloto automático. Sessão 5 (Caio, 07/10).
- [Progressão, coleta e combate visual](tribos-progressao-combate.md) — Níveis e XP por criatura, 276 nós de colheita com ferramenta, 28 sprites de item, arma na mão, transparência por oclusão, dano/sangue/barras na tela. Sessões 6-7 (Caio, 07/10).
- **Fluxo git:** Caio trabalha no fork `caiolea0/epic-loot-adventure` e manda PR pro `OrbitrumConnect`. Sem force push.
- **Pipelines de arte:** `art/city/` (160 sprites de construção, 20 níveis × 8) e `art/items/` (28 sprites de item). Ambos regeneráveis: Codex com `gpt-5.6-luna` esforço médio, sheets 2×2, recorte por script. Sheets brutas fora do git.
- **Subagentes do projeto** (em `~/.claude/agents/`, fora do repo): `tribos-game-systems`, `tribos-world-3d`, `tribos-hud` — todos `claude-sonnet-5-5`, esforço médio, cada um com as regras duras do seu escopo.

## Feedback

- **Diário e memória sempre (Caio, 06/10)** — atualizar diário do dia e este índice a cada etapa: o que foi feito, conclusões, achados. Só adicionar.

- [Não apagar conteúdo](feedback-nao-apagar-conteudo.md) — quando Pedro pede pra editar algo, SÓ adicionar o que pediu; nunca reescrever/apagar o resto sem perguntar antes.
- [Começar pela memória](feedback-comecar-pela-memoria.md) — tudo já está mapeado (diário/checklist). NÃO re-explorar codebase nem usar subagents pra redescobrir. Ler memória primeiro. Economiza token.

## Diários TRIBOS (`diarios/`)

> Correção: a pasta é `docs/tribos/diarios/`. Os links `diarios-tribos/` abaixo estão quebrados desde o começo.

- [2026-10-07](diarios/2026-10-07.md) — Sessões 5-7. PR #1 (cidade) mergeado. Acampamentos + objetivos idle/manual, progressão e coleta, mapa real, sprites de item, troca de arma, transparência, retorno visual do combate. 136 testes. PR #2 aberto.
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
