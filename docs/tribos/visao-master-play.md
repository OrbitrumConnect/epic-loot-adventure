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

### Pedidos somados de 31/10 (3 mensagens), pra não se perder
1. Muro da base 13–14 · torres fora do muro · modo livre ("talvez") · não pesar/bugar · hordas 5–8 min a mais ·
   nível do carro e do skate · quadro de missões MIR4 (até 10, idle) · Clash ↔ mapa "não esquecer" → **3.1–3.5**
2. Botões do carro no celular menores, embaixo, no esquema dos poderes → **3.6**
3. Surf dá XP (tubo maior) · amigo atira do carro · carro com dano/explosão/farmável · carro = nível + recurso → **3.7–3.8**

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
- [ ] Hordas: +5 min em toda paz na Zona Sul (ou +8, um número)
- [ ] Níveis: medir tempo até nv 15/20/25/30 → decidir skate/carro (proposta 20/30)
- [ ] Celular: Carro/Correr/Descer menores, embaixo, no esquema dos poderes; aparecem só quando servem
- [ ] Base elite: lado 13 (ímpar), torres de perímetro (4–6), modo livre depois do Lv1 (teto de peças)
- [ ] Piloto andar dentro da caverna (pra liberar missão automática lá)
- [ ] Surf dá XP: em pé na onda por segundo, no TUBO maior (proposta 3×), teto por onda
- [ ] Carro: passageiro (amigo/aliado) puxa a arma e atira — depende do carro online (Fase 5)
- [ ] Carro: vida, dano (topos armados), explosão; "farmável" = destroços devolvem recurso? ou loot no PvP? (decidir)
- [ ] Carro: construir com nível + recurso do armazém; explodiu → farmar outro (save em chave opcional)

**Fase 6 — raid e cerco** (não existe nem no Vale)
- [ ] Tropas etapa 2 (escolta) e 3 (raid) · tropa tank
- [ ] Bazuca −40% de muro
- [ ] Saco de loot visível (PvP 25%, 30 s do matador)

**Pendências técnicas já conhecidas**
- [ ] INP 224 ms (clique travando a tela)
- [ ] Câmera atrás de morro pode tapar o herói (sem mexer sem pedido)
- [ ] Carregamento a frio: herói invisível nos 1ºs segundos sem cache
- [ ] Disco do PC de trabalho em 99% (2,7 GB livres) — liberar antes de build pesado
