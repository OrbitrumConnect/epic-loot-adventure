# TRIBOS — Parecer Produto + Técnico

Escrito para: Pedro (decisão de produto) e o time (Caio na execução).
Data: 21/10/2026. Base: auditoria do código real nesta sessão + conhecimento do gênero
(idle/incremental, survival/base-building, .io 3D no navegador). Onde eu digo "mercado" é leitura
de categoria, não benchmark fresco — vale confirmar com pesquisa de mercado antes de apostar alto.

---

## 1. O que temos na mão (estado real, auditado)

Um **survival 3D jogável direto no navegador**, sem instalar, com:
- **Mundo 3D de verdade** (React Three Fiber + three): mapa GLB com relevo/colisão, vegetação,
  água, dia/noite, iluminação estilizada (cel-shade). Roda em PC e celular.
- **Loop de sobrevivência + ondas**: farm → construir/evoluir base (3 tiers: madeira→pedra→metal)
  → defender das ondas (torres, tropas) → evoluir. Paz entre ondas escala pra dar fôlego.
- **Piloto automático (idle)**: o personagem farma/caça/defende sozinho com decisões reais
  (prioriza combate ao levar dano, respeita a arma escolhida, foge/recua por vida, volta pra base
  com bolsa cheia). Isso é **incomum** no gênero survival e é um ativo forte.
- **Poderes do herói** começando (Chuva de Flechas, desbloqueia no nível 5, 3 ondas, escala com
  nível, cooldown-only) — base pra "cartas a cada 5 níveis".
- **Co-op + PvP**: entrar por link/sala; card Aliado/Inimigo; fogo amigo entre inimigos; distância
  mínima entre bases. Sala pública listável (aba Salas).
- **Conta + persistência** (Supabase): login nome+email+senha, progresso salvo na conta,
  ranking. Multiplataforma (PC/celular, mesmo save).
- **Mobile**: joystick flutuante + pular/atacar, HUD adaptado.
- **Qualidade de engenharia**: 383 testes, TypeScript estrito, camada pura separada do render,
  save local + conta, tratamento de erro de asset (não derruba o jogo), diário técnico.

Resumo honesto: a **fundação é sólida e rara** — pouquíssimos jogos entregam 3D + survival + idle
+ co-op/PvP **no navegador, sem download**. O esqueleto do "jogo grande" está de pé.

---

## 2. Onde estamos vs o mercado

**Diferenciais (o que nos separa):**
- **Instant-play 3D**: survival 3D costuma exigir download (Rust, Valheim, Ark). Nós abrimos num
  link. Atrito de entrada ≈ zero → **adesão** é o nosso maior trunfo.
- **Híbrido idle + ativo**: survival puro exige presença; idle puro é 2D/menus. TRIBOS deixa
  **progredir jogando OU ausente** (auto-pilot). Isso amplia o público (casual + hardcore) e a
  retenção (volta pra ver o que rendeu).
- **Co-op/PvP leve por link**: entrar numa partida de amigo é 1 clique, sem conta obrigatória pro
  P2P. Os .io (MooMoo, Zombs, Taming) provam que base-building + PvP no navegador vicia — mas são
  **2D**. Nós somos 3D.

**Paridade (o que já é padrão e temos):** waves/tower-defense, base com tiers, loot/inventário com
stacks, ranking, progressão por nível, feedback de dano, áudio.

**Onde o mercado está à frente (gaps a fechar):**
- **Onboarding**: os campeões de adesão ensinam o loop nos primeiros 30–60s. Hoje o nosso começo
  depende de o jogador descobrir sozinho.
- **Progressão de meta / "um a mais"**: idle games fortes têm camadas (prestígio, cartas, missões
  diárias, metas offline claras). Começamos (cartas/poderes) mas falta profundidade e clareza.
- **Social/retenção**: clãs (tribos de verdade), ranking global vivo, eventos. Temos a base
  (conta/ranking) mas não o ciclo social.
- **Performance em aparelho fraco**: sem qualidade adaptativa, celular/GPU integrada sofre — e é
  justamente onde mora a adesão em massa.

---

## 3. Riscos / limitações atuais (honesto)

- **Fluidez de rede (multiplayer)**: criaturas do convidado teleportam a cada 450ms (sem
  interpolação) e o snapshot é full → a sensação de "realtime" ainda não está lá. **É o gap #1 de
  percepção de qualidade no co-op/PvP.** (ver `mapa-realtime-performance.md` B1/B2)
- **VRAM/peso**: texturas descomprimidas (herói 4K, inimigos 2K×N) somam GB em ondas → trava em
  aparelho fraco. Sem KTX2/downscale, a adesão mobile sofre. (mapa A2)
- **Sem qualidade adaptativa**: todo device renderiza igual (mapa A4).
- **Autoridade do host**: se o host cai, a sala cai. Pro "escalável de verdade" futuro, a
  simulação precisaria migrar pra servidor (game service) — hoje é P2P com host. Tudo bem pro
  estágio atual; é um teto conhecido.
- **Economia/balance ainda em ajuste** (custos, drops) — normal nesta fase.

---

## 4. Melhorias por eixo — SEM perder performance

Cada item marcado com impacto (📈 adesão/retenção) e custo (⚙️ esforço). Ordenado por ROI.

### Fluidez (percepção de qualidade) — faz o jogo PARECER AAA
1. **Interpolar criaturas no convidado** 📈📈 ⚙️ baixo — mata o "andar aos trancos" do co-op. (mapa B1)
2. **Qualidade adaptativa** (resolução/efeitos por FPS, com histerese) 📈📈 ⚙️ médio — abre o jogo
   pra aparelho fraco **sem** tirar a arte de quem tem máquina boa. (mapa A4)
3. **Downscale 4K→1-2K + KTX2** 📈 ⚙️ médio — corta VRAM ~6×, menos travada mobile. (mapa A2)
4. **Painel de métricas + cena de benchmark** ⚙️ baixo — pra provar cada ganho com número. (mapa D)

### Adesão (primeiros minutos → fica)
5. **Onboarding de 60s**: um objetivo guiado ("colha madeira → reivindique base → sobreviva à 1ª
   onda") com dicas contextuais. 📈📈📈 ⚙️ médio — **maior alavanca de retenção D1**.
6. **Progresso offline real** (não só o BackgroundSim): ao voltar, "enquanto fora, você farmou X /
   repeliu Y ondas" com teto. 📈📈 ⚙️ médio — o fisga do idle; traz o jogador de volta.
7. **Juice**: números de dano melhores, screen shake leve, partículas de impacto, SFX de poder
   (já começamos). 📈 ⚙️ baixo — faz cada ação "sentir" bem.

### Profundidade (fica → investe)
8. **Cartas a cada 5 níveis** (poderes + passivos) com escolha real. 📈📈 ⚙️ médio — o "um nível a
   mais". A Chuva de Flechas já é a semente.
9. **Clãs/Tribos** (nome do jogo!): grupo persistente, ranking de tribo, base compartilhada.
   📈📈📈 ⚙️ alto — é o maior motor social e combina com a marca.
10. **Metas diárias + eventos de onda** (boss semanal). 📈📈 ⚙️ médio — motivo de voltar todo dia.

### Escala (muitos jogadores)
11. **Snapshot incremental de rede** (delta) 📈 ⚙️ médio — segura custo/limites do Supabase. (mapa B2)
12. **Limpeza de salas órfãs + métricas de tráfego** ⚙️ baixo. (mapa C)
13. **(Futuro) Game service autoritativo** pra tirar o teto do host P2P — só quando a base de
    jogadores justificar. ⚙️ alto.

---

## 5. O diferencial pra apostar (minha leitura)

**"Survival 3D de tribo, no navegador, que avança até quando você não está — sozinho ou com os
amigos."** Essa frase junta nossos 3 trunfos (instant-play 3D + idle + social/tribo) que, **somados**,
quase ninguém tem. Cada um isolado existe; a combinação é o diferencial.

Pra isso virar adesão real, a ordem que eu seguiria:
1. **Fluidez** (itens 1–3): o jogo precisa *parecer* liso, senão o 3D vira contra nós.
2. **Onboarding + progresso offline** (5–6): transformar curioso em jogador recorrente.
3. **Tribos/clãs** (9): o social é o que segura a longo prazo e casa com a marca.

---

## 6. Recomendação final

Temos uma **fundação acima da média** pro estágio — rara no navegador. O caminho pro "elite" **não**
é mais features soltas; é **polir a fluidez**, **ensinar o loop** e **ligar o social**. Tudo isso dá
pra fazer **sem sacrificar a arte**: a regra do mapa de performance (medir o gargalo, não arrancar
grama) vale também pra produto — não diluir a identidade pra crescer.

Próximo passo concreto e de maior ROI/risco baixo: **interpolar as criaturas no convidado (mapa B1)**
+ começar o **onboarding de 60s**. Com esses dois, o jogo ganha "cara de pronto" pra mostrar e testar
adesão de verdade.

> Observação: este parecer é leitura de categoria + código. Antes de decisões grandes de produto
> (posicionamento, público-alvo, monetização), vale uma rodada de pesquisa de mercado fresca e
> alguns playtests com gente nova (medir onde largam nos primeiros 2 minutos).
