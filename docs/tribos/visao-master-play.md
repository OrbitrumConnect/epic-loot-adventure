# TRIBOS — Visão MASTER PLAY + checklist (31/10/2026)

> Pedro (31/10): "olhando tudo do game, evolução, onde estamos e jogabilidade — prender o usuário (passar o mapa, surf,
> matar bichos, caverna)… quadro de missões (até 10, ele faz no idle), meio MIR4… o Clash que upa a base com os recursos
> espelhados no mapa… soma tudo (a visão de hoje + a migração do Vale) e traz visão + checklist pra pensarmos juntos".
> Nada aqui foi codado. Cada item só com o go do Pedro. Fontes: diário 31/10 (§6 "o sentido que o jogo está tomando"),
> `zona-sul-migracao.md` (plano e lista viva), memória do projeto e o código de hoje (`792ca1d`).

---

## 1. Onde estamos (31/10, fim do dia)

**Migração Vale → Zona Sul (plano de 29/10)**

| Fase | Estado |
|---|---|
| 0 · Fundação (mesmo save, prancha no catálogo, inventário de verdade) | ✅ |
| 1 · Combate (armas, mira, poderes, munição, morte/renascer, piloto) | ✅ |
| 2 · Fauna e farm por região (jacaré na Lagoa, leão no campo, praia segura) | ✅ |
| 3 · Acampamentos + chefe 15 min + piloto | ✅ (12 acampamentos + 4 topos armados) |
| 4 · Base, hordas, torres, tropas, casa, cartas, Clash | ✅ **hoje** (`738d29f`) — falta ver na tela casa de pedra/metal, tropas e poderes da base |
| 5 · Online (salas, host, PvP, caverna na rede) | 🟡 montado e com a camada da caverna; **falta o teste com 2 jogadores no site** |
| 6 · Raid e cerco (tropas tank, bazuca −40% muro, saco de loot) | ⬜ não existe nem no Vale |
| Virada (Zona Sul padrão) | ✅ desde 29/10 · **apagar o Vale** = depois do teste online e com o teu OK |

**O que o jogador tem pra fazer hoje na Zona Sul**
- **Explorar:** relevo real do Rio, surf (Arpoador + Sorriso), prancha nv 5, asa-delta nv 8, skate voador nv 15, carro
  voador nv 25, navio, caverna do Rebouças (chefe a −32 m, saídas Leblon e Laranjeiras), dia/noite.
- **Lutar:** ~269 bichos por região, 12 acampamentos no mato, 4 topos armados (Sumaré, Horto, Gávea, Rocinha), 13
  inimigos + chefe na caverna, chefe a cada 15 min, pombos e mortos-vivos à noite.
- **Construir:** reivindicar a base, entregar recurso, Lv1 padrão (41 peças), hordas, cartas de evolução, casa
  madeira → pedra → metal, Clash.
- **Clash ↔ mapa (já existe, não esquecer):** o ARMAZÉM do Clash É o armazém da base (23/10). Construir no mapa paga
  primeiro do armazém e depois da bolsa. A cidade só PRODUZ com a base no chão (24/10). A MOCHILA é separada: ela entra
  no armazém pelo "Depositar mochila na cidade" ou entregando na base (E/martelo). Como a Zona Sul usa a mesma store,
  tudo isso já vale aqui. Falta só conferir na tela.

**Diagnóstico de jogabilidade (o que prende)**
- O MAPA responde **"o que eu faço agora"**. Está muito forte, acima de muito jogo pronto.
- A BASE responde **"pra quê"**: progresso que fica. Chegou hoje na Zona Sul.
- Falta responder **"o que eu faço HOJE"**: um rumo do dia que leve o jogador pelo mapa todo (surf, caverna, topos,
  bichos) e devolva recurso pra base. É o papel do **quadro de missões**, e as peças dele já existem (§3).

---

## 2. A sessão de jogo que a gente quer (o loop do dia)

```
entra ─▶ BASE/CLASH: recolhe a produção, sobe prédio, escolhe carta
   │
   ├─▶ QUADRO DE MISSÕES: escolhe até 10 do dia
   │       ├─ automáticas (caçar / farmar / limpar acampamento / ir até) → o IDLE faz sozinho, em fila
   │       └─ manuais (surf, asa-delta, caverna, chefe, topo armado) → valem mais, o jogador faz
   │
   ├─▶ o recurso das missões cai no ARMAZÉM → a base sobe → a HORDA testa a base (paz maior na Zona Sul)
   │
   └─▶ (Fase 5–6) online: outros jogadores, PvP, raid na base dos outros
```
Pilares que isso respeita (selados): pós-colapso (sobreviver e reconstruir), 3 camadas em loop
(Base → Mapa → Raid → Base), nível não é porta pro PERIGO do mapa (ele é recompensa de progressão), sem P2W.

---

## 3. As propostas (cada uma com o que JÁ EXISTE e o que seria NOVO)

### 3.1 Quadro de missões (estilo MIR4) — o maior ganho de jogabilidade
- **Como joga:** um painel com as missões do dia (proposta: 20 oferecidas, o jogador escolhe até 10). As automáticas
  viram fila do piloto e o IDLE faz uma atrás da outra. As manuais ficam marcadas no mapa (M) e o jogador faz quando
  quiser. Renova 1×/dia.
- **Já existe (o piloto já sabe fazer):** a fila de objetivos com 5 tipos (`limpar acampamento`, `caçar bicho`,
  `coletar nó`, `ir até`, `caçar na área`), modo idle executando a fila, repetir no fim, regra selada do piloto
  (defende → farma → caça → volta), zonas do mapa (M), XP/loot, armazém.
- **Exemplos sem inventar mundo novo** (usam o que já está no mapa):
  - auto: "Limpar o acampamento do Horto", "Caçar 8 jacarés na Lagoa", "Coletar 40 madeira na Tijuca", "Ir até o Cristo"
  - manual: "Pegar 3 ondas no Sorriso", "Descer de asa-delta do Corcovado até a Lagoa", "Atravessar a caverna
    Humaitá → Leblon", "Derrotar o chefe da caverna", "Tomar o topo da Rocinha", "Segurar a onda N da horda"
- **Recompensa:** XP + recurso direto no ARMAZÉM (o Clash sobe com as missões). Missão manual paga mais que a
  automática. Sem ouro (ouro = monetização futura, decisão de 23/10).
- **Seria NOVO:** o catálogo de missões (dados), o contador de progresso (abates por bicho/região, coleta), o painel e o
  pagamento. O progresso vai numa chave OPCIONAL do save (lição do nv 38: campo novo nunca derruba o save).
- **Peso:** zero 3D novo. É só HUD + contadores, e o painel é componente próprio (regra anti-lag de 30/10).
- **Cuidados:** o piloto na caverna anda reto e pode travar nas curvas (diário 31/10 §5). Por isso as missões de
  caverna ficam manuais até ele saber andar lá dentro.

### 3.2 Hordas mais espaçadas na Zona Sul ("mapa maior, mais jogabilidade")
- **Hoje (Vale e Zona Sul):** 1ª horda 5 min depois de fechar a base. Entre ondas: 3 min (ondas 1–5), 6 → 10 min
  (6–20), 11 → 14 min (21+).
- **Proposta:** SÓ na Zona Sul, **+5 min em toda paz** (o começo do teu "5 a 8 min a mais"). Fica: 1ª 10 min ·
  ondas 1–5 = 8 min · 6–20 = 11 → 15 min · 21+ = 16 → 19 min. É um número só, e +8 em vez de +5 é trocar ele.
- **Quem quer ação não espera:** "Chamar a horda agora" já existe. Pular a paz dá +10% de loot por minuto pulado
  (teto +50%).
- O aviso "primeira horda em ~5 min" passa a mostrar o tempo certo.

### 3.3 Tamanho da base (o muro NÃO encurtou)
- É 11 quadrículas × 2 m = **22 m de lado** desde 13/10 (antes era 8 = 16 m). Nunca diminuiu.
- **Se for aumentar: 13 (26 m), não 14.** Lado ÍMPAR mantém a cama numa quadrícula do meio. Lado par põe o centro
  entre duas quadrículas, e foi o "meia célula" que derrubou o save do nv 38 em 23/10.
- **Muda:** perímetro 40 → 48 peças (+8 muros = Lv1 mais caro), distância mínima entre bases 66 → 78 m, layout Lv1
  esticado. Bases já reivindicadas guardam o tamanho delas (11) e não quebram.
- Pedro: "tá ok por hora". Fica anotado pro pacote "base elite" (3.5).

### 3.4 Nível do carro e do skate ("andam bem pelo mapa")
- **Hoje:** prancha 5 · asa-delta 8 · skate voador 15 · carro voador 25 · fuzil 35 (`unlockSystem.ts`, fonte única).
- **O problema:** voar cedo encolhe o mapa. A distância é parte da graça, e a caverna e a asa-delta perdem sentido como
  atalho.
- **Proposta pra pensar:** skate 15 → **20**, carro 25 → **30**. Até ~20 o jogador atravessa o Rio a pé, de asa-delta
  (precisa de morro) ou pela caverna (atalho Humaitá ↔ Leblon ↔ Laranjeiras), e voar vira recompensa grande. Os topos
  armados já atiram no carro, então voar já tem risco.
- **Antes de decidir:** medir quanto tempo de jogo leva até o nv 15/20/25/30 (contas de teste). Nível = tempo, e é o
  tempo que interessa. Contas que já passaram desse nível não perdem nada.

### 3.5 Pacote "base elite" (depois do Lv1) — "pode ser, talvez"
- **Modo livre:** depois do Lv1 pronto, acrescentar peças DENTRO do quadrado (mais muro, torre, 2ª fileira). O Lv1
  continua padrão e cada um personaliza por cima. Usa o construtor em grade que já existe e só está desligado na tela
  (`previewLine`/`placePieces`, madeira/pedra/ferro).
- **Torres de perímetro (4–6 fora do muro):** um anel de alguns metros em volta do muro onde só entra torre. A torre já
  tem nível, tiro e alvo pela camada, e 6 torres a mais pesam pouco (hoje são 4 e atiram de boa).
  Regra que fica: torre nunca alcança outra base (por isso a distância entre bases sobe junto).
- **Não pesar / não bugar:** teto de peças por base (proposta: +30 além das 41), a porta continua obrigatória, o teste
  de "base fechada" e o caminho da horda seguem os mesmos, e a contagem de triângulos é feita antes de ligar.
- Muda a decisão selada de 09/10 (layout Lv1 padrão). Por isso só com o teu go, e de preferência depois do teste online.

### 3.6 Celular — botões do carro (Pedro: "grandes em cima, não tá bom")
- **Hoje:** Carro / Correr / Descer ficam empilhados ACIMA do arco de poderes (62×38 px cada) e o LEVANTAR acima deles.
- **Proposta:** botões MENORES e EMBAIXO, no mesmo esquema dos gatilhos dos poderes (redondos, junto do arco). E
  aparecer só quando servem: "Carro" perto do carro ou dentro dele, "Descer" no carro/na água, "Correr" sempre. Menos
  coisa na tela, cara mais pro. Não mexe nos poderes nem no joystick.

### 3.7 Surf dá XP, e o TUBO dá mais (Pedro, 31/10 noite: "pra não esquecer")
- **Hoje:** surfar não dá XP nenhum. O jogo já sabe quando o herói está EM PÉ na onda e quando está DENTRO DO TUBO
  (é o que fecha a câmera no tubo, `zsWaterInTubeAt`). Ou seja, a parte difícil já existe.
- **Proposta:** XP por segundo em pé na onda e XP "maiorzinho" no tubo (ex.: 3× o da onda), pago quando a onda acaba
  (cai, sai ou a onda morre). Vale pro Arpoador e pro Sorriso. Casa com a missão manual "pegar N ondas" (3.1).
- **Pra decidir junto:** um teto de XP por onda, pra não virar farm de XP parado no tubo.

### 3.8 Carro voador: amigo atirando, dano/explosão, construir com nível + recurso (Pedro, 31/10 noite)
- **Hoje:** o modelo tem 5 bancos, mas só o do motorista é usado. O carro ainda não vai pela rede (o amigo não vê nem
  entra; isso está na Fase 5). Dentro do carro o herói não ataca. O carro não tem vida (os topos armados atiram nele,
  mas não quebra). É o "veículo do mapa", liberado no nv 25, e não é item de mochila.
- **Pedido:**
  - (a) **amigo/aliado no carro puxa a arma e atira** (o motorista dirige, os passageiros atiram);
  - (b) **o carro leva dano e EXPLODE**, e talvez seja "farmável";
  - (c) **o carro custa nível + recurso pra construir**. Se explodir, tem que farmar outro, e isso deixa o jogo mais
    dinâmico.
- **Como encaixa no que já existe:**
  - (a) depende do carro online (Fase 5): o passageiro senta nos bancos 2–5 do carro do outro e usa as MESMAS armas e a
    mira do jogo.
  - (b) os topos armados que já atiram no carro passam a ser perigo de verdade. Junta com a proposta do carro no nv 30
    (3.4).
  - (c) o carro vira algo seu, que precisa ir pro save numa chave OPCIONAL (lição do nv 38). A receita deve usar recurso
    que já existe (madeira/pedra/ferro do armazém), sem item novo inventado.
- **Pra decidir junto:** o que é "farmável": os destroços do SEU carro devolvem parte do recurso, ou carro de OUTRO
  jogador derrubado dá loot (PvP)?

### 3.9 Mar vivo: tubarão, navios e navio de guerra no nv 80 (Pedro, 31/10 noite)
- **Pedro vai mandar:** tubarão em GLB animado (com ataque) e 2 navios ("não sei qual é melhor, vemos depois").
- **Tubarão:** entra como os bichos de hoje (GlbCreature com os clips dele), no mar. **Pra decidir junto:** onde. A
  regra de 29/10 é "praia mais vazia (zona segura)" e o Arpoador é o nascedouro, então a proposta é mar fundo, além
  da arrebentação, ameaçando quem nada, rema ou cai da prancha.
- **Navios:** hoje existe 1 navio parado entre Ipanema e Leblon (cenário com colisão e escada). Dos 2 novos, escolhemos
  por foto e por triângulos (mesmo funil do carro: compactar e conferir de lado/de trás).
- **Navio de guerra no nv 80, que ataca outro navio (PvP):** é sistema NOVO e grande. Precisa de navio que se dirige
  (hoje o navio é parado), canhão/tiro de navio, vida do navio e tudo isso online. Liberação = uma linha no
  `unlockSystem.ts` (fonte única), mas o resto é etapa da guerra (junto da Fase 6, depois do online redondo).

### 3.10 Online 100% na Zona Sul (Pedro: "experiência multiplayer tudo ok, checar se está 100%")
Roteiro do teste com 2 jogadores no site (tu + Caio), item por item:
- [ ] entrar na mesma sala, um ver o outro andando/correndo/nadando, nome e nível certos
- [ ] **carro/prancha/asa-delta/skate do outro aparecem?** Hoje NÃO: o jogador remoto é desenhado só como herói.
      Quem voa de carro aparece pros outros como herói flutuando no ar → precisa mandar o "veículo" na pose e
      desenhar o modelo (o carro/prancha já existem)
- [ ] onda do Arpoador/Sorriso igual pros dois (série pelo relógio da sala)
- [ ] caverna: quem está dentro NÃO aparece na superfície; bicho da caverna mira o convidado lá dentro
- [ ] base de cada um no mapa do outro; horda de cada um (convidado pede ao host); torre atira no inimigo
- [ ] PvP com alvo travado; quem te matou; morte/renascer na base
- [ ] host sai → outro vira host sem perder bichos/ondas; sala pausada volta (até 3 dias)
- [ ] save de cada um certo depois (nível, base, onda)
- [ ] medir o tráfego (o Supabase grátis chegou a 4,13 de 5 GB em 27/10, com 192 bichos; a Zona Sul tem ~280)

### 3.11 Elite escalável SEM perder FPS — medido HOJE na Zona Sul (Pedro: "ver na Zona Sul pra não pesar")
Volta de medição (script com navegador, dia, câmera atrás do herói, PC de teste com outro programa comendo CPU →
o FPS é comparativo, os triângulos não dependem da máquina):

| Lugar | FPS | desenhos | triângulos/quadro |
|---|---|---|---|
| Nascedouro (Arpoador) | 47 | 221 | 1,96 mi |
| Copacabana / Sorriso | 46 | 194 | 2,05 mi |
| Mato aberto (área de base) | 44 | 166 | 2,16 mi |
| Topo da Gávea (acampamento) | **22** | 269 | 2,29 mi |
| Topo da Rocinha (acampamento) | 31 | 181 | 1,87 mi |
| Sumaré (acampamento) | 25 | 252 | 2,14 mi |
| Caverna (encruzilhada) | 48 | 120 | 1,43 mi |

**O teto combinado em 29/10 é ≤ 600 mil triângulos e ≤ 120 desenhos no PC (celular: metade). Estamos 3× acima.**
Em 29/10 eram ~140 mil. O mapa encheu (mata, coleta, acampamentos, caverna) e ninguém mediu o total desde então.

**Onde está o peso (separado por peça):**
1. **SOMBRA ≈ metade de tudo** (0,9 a 1,4 mi de triângulos por quadro só na passada da sombra). E **dentro da caverna
   a sombra do sol continua sendo desenhada** (lá o sol é zero → ninguém vê). Desligar a sombra do sol enquanto o sol
   está apagado na caverna = **−1,3 mi na caverna, visual idêntico**. (Sem desligar a luz, regra de 30/10: só para de
   atualizar o mapa de sombra.)
2. **Árvores de COLETA: 48 árvores de 8.868 triângulos = 426 mil na câmera + 426 mil na sombra.** Elas são um
   bloco só, então as 48 vão pra sombra mesmo que só 2 estejam perto (a sombra cobre ±45 m em volta do herói).
   Separar "perto (com sombra)" de "longe (sem sombra)" = **−400 mil, visual idêntico** (a sombra das de longe já cai
   fora da área da sombra). Opcional depois: versão simplificada pras de longe.
3. **Acampamentos: o modelo (15,9 mil triângulos) dos 12 é desenhado até a 1 km.** Versão leve de longe
   (`simplify-glb.mjs`, já usado) = **−170 mil**, imperceptível de longe.
4. **Terreno ~330 mil** (perto 224 mil + longe 103 mil): é o chão, fica. Só mexer se o celular pedir.
5. Topos com acampamento (22–31 FPS): os inimigos com sombra somam ~150 mil + o acampamento. Os itens 1–3 já aliviam;
   depois medir de novo.

**Somando 1–3, sem mudar o visual: ~2 mi → ~1,3 mi na superfície e ~1,4 mi → ~0,1 mi na caverna.** Pra chegar no teto
de 600 mil e caber o tubarão, os navios e 8 jogadores, entra o resto da lista abaixo.

**Regras pra escalar (meu ponto de vista):**
- **Medir sempre:** a volta de medição vira comando fixo. Cada coisa nova (tubarão, navio, missão) entra com o número de
  antes/depois no diário. Foi o que faltou de 29/10 pra cá.
- **Funil de modelo novo:** compactar, simplificar, contar triângulos, sombra só de perto, animar só de perto,
  pré-aquecer na carga (regras de 30/10). O tubarão e os navios passam por ele.
- **Anfitrião = aparelho mais forte:** hoje o host é quem entrou primeiro. No mapa grande ele simula os bichos perto de
  TODOS os jogadores; se for um celular, a sala inteira sofre. Preferir PC quando houver.
- **Servidor valida o que vale loot:** PvP com saco de loot, raid e navio de guerra não podem confiar só no save do
  aparelho (risco já anotado em 23/10). Validar no Supabase antes de abrir PvP valendo coisa.
- **Apagar o Vale** depois do teste online: menos código pra baixar no celular.
- **Conteúdo como dado:** missões, liberação por nível, receitas (carro) e bichos por região em tabelas. Conteúdo novo
  sem mexer em regra = sem bug novo.

### Pedidos somados de 31/10 (3 mensagens), pra não se perder
1. Muro da base 13–14 · torres fora do muro · modo livre ("talvez") · não pesar/bugar · hordas 5–8 min a mais ·
   nível do carro e do skate · quadro de missões MIR4 (até 10, idle) · Clash ↔ mapa "não esquecer" → **3.1–3.5**
2. Botões do carro no celular menores, embaixo, no esquema dos poderes → **3.6**
3. Surf dá XP (tubo maior) · amigo atira do carro · carro com dano/explosão/farmável · carro = nível + recurso → **3.7–3.8**
4. Tubarão GLB animado · 2 navios · navio de guerra nv 80 (PvP naval) · online 100% · elite escalável sem perder FPS →
   **3.9–3.11**

---

## 4. Ordem sugerida (proposta minha, tu decide)
1. **Rápidos, sem risco (1 sessão):** botões do carro no celular (3.6) · hordas +5 min na Zona Sul (3.2) · conferir na
   tela a casa de pedra/metal, tropas, poderes da base e o Clash produzindo na Zona Sul.
2. **Teste online com 2 jogadores no site** (tu + Caio): base, horda, PvP, caverna. Corrigir o que aparecer →
   **apagar o Vale** (com o teu OK).
3. **Quadro de missões v1** (3.1): só os tipos que o piloto já faz + 4–6 manuais, recompensa no armazém.
4. **Níveis do carro/skate** (3.4), depois de medir o tempo até cada nível.
5. **Pacote base elite** (3.3 + 3.5): base 13, torres de perímetro, modo livre.
6. **Fase 6 — raid e cerco** (tropas tank, bazuca, saco de loot visível).

---

## 5. CHECKLIST (soma de tudo: migração + visão de hoje)

**Migração Vale → Zona Sul**
- [x] Fases 0–4 (fundação, combate, fauna, acampamentos/chefe/piloto, base/hordas/Clash)
- [x] Online × caverna: altura/camada na rede, IA/torre/tropa/PvP por camada (`738d29f`)
- [x] Piloto recua pro nascedouro do mapa ativo (`792ca1d`)
- [ ] Conferir na tela da Zona Sul: casa de pedra/metal (escada/2º andar), tropas nas ondas, poderes da base, Clash produzindo
- [ ] Teste online com 2 jogadores no site (base, horda de cada um, PvP, caverna, carro/onda pros outros)
- [ ] Apagar o Vale (rota + código) — só depois do teste online e com OK do Pedro
- [ ] Deploy: Cloudflare Workers (Pedro migrando)

**Jogabilidade (visão master play)**
- [ ] Quadro de missões v1: até 10 por dia, automáticas no idle + manuais valendo mais, recompensa no armazém
- [x] Hordas: +5 min em toda paz na Zona Sul (ou +8, um número) — 01/11: +5 (`ZS_EXTRA_PEACE_MS`)
- [ ] Níveis: medir tempo até nv 15/20/25/30 → decidir skate/carro (proposta 20/30)
- [x] Celular: Carro/Correr/Descer menores, embaixo, no esquema dos poderes; aparecem só quando servem (`b92547e`, 31/10:
  dentro do arco — dirigindo = Subir/Descer/Turbo/Sair; a pé = Carro perto do carro, Mergulhar nadando)
- [ ] Base elite: lado 13 (ímpar), torres de perímetro (4–6), modo livre depois do Lv1 (teto de peças)
- [ ] Piloto andar dentro da caverna (pra liberar missão automática lá)
- [ ] Surf dá XP: em pé na onda por segundo, no TUBO maior (proposta 3×), teto por onda
- [ ] Carro: passageiro (amigo/aliado) puxa a arma e atira — depende do carro online (Fase 5)
- [ ] Carro: vida, dano (topos armados), explosão; "farmável" = destroços devolvem recurso? ou loot no PvP? (decidir)
- [ ] Carro: construir com nível + recurso do armazém; explodiu → farmar outro (save em chave opcional)
- [x] Tubarão (GLB do Pedro, animado com ataque) no mar fundo — onde exatamente: decidir — 01/11 (`2ff2926`): perto dos
      picos (anel em volta do drop) + 3 soltos no mar; mordida 50; só caça quem está na água
- [x] (01/11) Remada e nado +25% (Pedro: "tá meio lento") — `2ff2926`
- [x] (01/11) Recursos de farm fora de pista/água (6 m) + folha da árvore de farm no tom da mata — `1eb4b60`
- [ ] (01/11) NAVIO DE GUERRA v1 nv 70 (embarcar, dirigir, canhões mirando) — em andamento (diário 01/11 §7)
- [x] Escolher 1 dos 2 navios novos (foto + triângulos) — 01/11: **A** (galeão com canhões no costado), 45 mil triângulos
- [ ] Navio de guerra no nv 80 que ataca outro navio (PvP naval) — etapa da guerra, depois do online redondo
      (01/11 Pedro: **nível 70**; bala de canhão MIRANDO — proposta no diário 01/11 §3)
- [ ] (01/11) Carro com barra de vida IGUAL à do herói (junto da vida do carro)
- [ ] (01/11) Tubarão: perto dos picos de surf (onde se chega remando, não em cima do drop) + alguns pelo mar
- [ ] (01/11) Mais inimigos que atiram nos morros (acima da Gávea, Vista Chinesa, Rocinha, Vidigal) — quantos cabem
- [ ] (01/11) Árvores com galhos/folhagem melhores + grama leve nas áreas verdes (fora de pista/areia) — proposta medida

**Online 100%** — roteiro em §3.10
- [ ] Teste com 2 jogadores, item por item
- [ ] Veículo do outro jogador visível (carro/prancha/asa-delta/skate) — hoje aparece só o herói
- [ ] Anfitrião = aparelho mais forte (PC antes de celular)
- [ ] Medir tráfego da sala na Zona Sul

**Desempenho (medido 31/10: ~2 mi de triângulos/quadro, teto 600 mil)** — §3.11
- [x] Sombra do sol parada enquanto o sol está apagado na caverna (−1,3 mi na caverna, visual igual) — 01/11
- [x] Árvores de coleta: sombra só nas de perto (−400 mil, visual igual) — 01/11: só as que tocam a caixa da sombra; e
      mais 2 achados medindo: desenhadas 2× (transparente + dupla face → 1 passada) e todas, até atrás da câmera (recorte)
- [ ] Acampamentos: modelo leve de longe (−170 mil) — 01/11: testado, muda pixels (160–600 a 250–400 m) → NÃO ligado
- [ ] Volta de medição como comando fixo; número antes/depois de cada coisa nova no diário
- [ ] Topos com acampamento (22–31 FPS): medir de novo depois dos 3 itens acima

**Fase 6 — raid e cerco** (não existe nem no Vale)
- [ ] Tropas etapa 2 (escolta) e 3 (raid) · tropa tank
- [ ] Bazuca −40% de muro
- [ ] Saco de loot visível (PvP 25%, 30 s do matador)

**Pendências técnicas já conhecidas**
- [ ] INP 224 ms (clique travando a tela)
- [ ] Câmera atrás de morro pode tapar o herói (sem mexer sem pedido)
- [ ] Carregamento a frio: herói invisível nos 1ºs segundos sem cache
- [ ] Disco do PC de trabalho em 99% (2,7 GB livres) — liberar antes de build pesado
- [ ] GM do Caio (`!item/!spawn/!goto/!start`, ramo dele `fc7e474`) SEGURADO: hoje libera pelo NOME "Joel" (nome livre na
  conta). Decidir: só local (igual F8) ou pela CONTA do Joel. Colosso, Atributos e nado já entraram (31/10).
