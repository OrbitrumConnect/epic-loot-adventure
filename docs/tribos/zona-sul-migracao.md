# TRIBOS — Migração do jogo para a ZONA SUL (plano, 29/10/2026)

> Pedro (29/10): "verificar o que do outro jogo passa pra cá — inimigos, acampamentos, dinâmica, raid — pro elite,
> melhor que o anterior, sabendo dos erros. De lá só ler diários e memória." Fontes lidas: `MEMORY.md`, diários
> 23–28/10 (auditoria 360, visão consolidada 25/10, lag 26–27/10), `tribos-acampamentos-objetivos.md`,
> `tribos-progressao-combate.md`, `tribos-raid-guerra.md`, `tribos-3-camadas.md`, `trabalho-pendente.md`.
> **Nada codado ainda — cada fase só com o go do Pedro.**

## Princípio: o que reaproveita e o que se monta de novo
- **Regras do jogo (puras, testadas) vêm inteiras:** `systems/*` — combate, armas, atributos, inventário, loot,
  dificuldade pela geografia, piloto (`decideIntent`), base/perímetro, horda/ondas, cartas, cidade (Clash), tropas,
  save. São ~1000 testes que já provam o comportamento. Mudar regra = só com o Pedro.
- **A cena 3D se monta de novo sobre o chão da Zona Sul:** a altura agora é UMA CONTA (`zsHeightAt`, mapa de altura),
  não raio em GLB. Isso elimina de raiz a família de bugs "bicho/herói/acampamento afundado ou flutuando" que custou
  dias no mapa velho (Couraça, Fúngico, bichos nascendo embaixo do mapa, base em meia célula).
- **Um personagem só:** o mesmo herói, nível, loot e base nos dois mapas (o save é o mesmo). Pra isso a PRANCHA (e o que
  mais nascer na Zona Sul) entra no catálogo oficial de itens ANTES de gravar qualquer coisa — o save recusa item
  desconhecido (incidente nv 38).

## Ordem proposta (cada fase fecha jogável, testada e medida antes da próxima)

| Fase | O que entra | Por que nessa ordem |
|---|---|---|
| **0 · Fundação** | Prancha no catálogo oficial; o I/hotbar da Zona Sul passa a ser o inventário DE VERDADE (hoje é só leitura); save valendo nos dois mapas; validar os saves REAIS do banco antes (lição do nv 38) | Sem isso nada que você ganhar aqui fica |
| **1 · Combate** | Armas na mão (espada/arco/pistola/fuzil), mira de ombro, Q/R/Z/X/C/F, munição, poções, morte/renascer | Tudo depois disso é bater em alguém |
| **2 · Fauna e farm** | Bichos POR REGIÃO real (jacaré na Lagoa, pombos na orla, búfalo/leoa no mato…), árvores/pedras de farm (as "árvores de farm" já existem na vegetação), perigo pela GEOGRAFIA (praia/orla segura → Floresta da Tijuca e morros mais perigosos), dia/noite | O mapa ganha vida e o farm alimenta a base |
| **3 · Acampamentos + chefe + piloto** | Acampamentos em RUÍNAS reais (favelas/morros) com fogueira acesa (pedido seu), chefe a cada 15 min, piloto automático com a regra selada (defende → farma → caça somando → volta ao ponto) | Objetivos espalhados pelo mapa |
| **4 · Base, hordas e cidade** | Reivindicar terreno sobre o mapa de altura, muros/torres/casa madeira→pedra→metal, hordas (com intervalo MAIOR, pedido seu), cartas, cidade (Clash) com armazém compartilhado, tropas nas ondas; locais de base escolhidos por você | O coração do loop |
| **5 · Online** | Salas, host simula, mundo em diferenças (egress), PvP, horda de cada um, carro voador e onda/prancha visíveis pros outros | Só depois de o solo estar redondo |
| **6 · Raid e cerco** | Raid escopada à BASE (foto offline / ao vivo online), tropas tank, bazuca −40% muro, saco de loot do PvP (30 s do matador, % fechados) | É a guerra — exige tudo antes |

Celular acompanha cada fase (botões do carro e da prancha incluídos), não fica pro fim.

## O que NÃO vem (placebos e bugs conhecidos do mapa velho)
- Botões de mentira: Raids "Iniciar operação", Tribo com texto fixo, aba Loot = inventário, textos "Era do Ferro" fixos.
- OURO sem uso e TROPAS só contando — só entram com função (decisões de 23/10: ouro = monetização futura; tropas = ondas
  → escolta → raid).
- Saco de loot invisível (`deathBags` que ninguém vê e cresce sem fim) — só vem com o saco VISÍVEL e pegável.
- Editor F8 sem trava; save só no cliente onde valer ranking/raid (validar no servidor antes).

## Armadilhas já pagas (não repetir)
- **Travamento = CPU, não GPU** (26/10): a página re-renderizava e levava a árvore 3D inteira → mundo em `React.memo`,
  HUD por ref/intervalo (nunca estado por quadro), lista de bichos ESTÁVEL (27/10), sem lixo de memória por quadro.
- **Escrita com estado velho** apagava eventos (usar `set` funcional); `behavior` da IA tem que ser gravado (senão a
  defesa do piloto nunca dispara); corda curta pros saqueadores (11–16 m); barra de vida só até 12 m.
- **Schema estrito do save derruba o save inteiro** → campo novo é sempre opcional; testar com os saves reais.
- **Animação por distância** (bicho longe atualiza menos), luzes com orçamento, texturas ≤ 1024 / KTX2, casa carrega só o
  tier em uso, sombra com interruptor — tudo isso vem junto desde o 1º dia, não como remendo.
- **Perigo pela GEOGRAFIA, nunca pelo nível do jogador** (regra selada "nível não é porta").
- **Trocar de branch com o vite rodando** regera o `routeTree.gen.ts` sem a rota (28/10) → restaurar e reiniciar.

## Orçamento de desempenho (medido hoje na Zona Sul)
~140 mil triângulos e ~35 chamadas de desenho parado; ~350 mil com a onda; 55–60 FPS aqui (tecla **P** mostra). Cada fase
diz quanto somou e não passa do teto combinado (proposta: ≤ 600 mil triângulos e ≤ 120 chamadas no PC; celular metade).

## Caminho escolhido (29/10) — "levar o mapa pra casa do jogo", com chave liga/desliga
Pedro: "passar o jogo pra cá ou o mapa pra lá — qual é mais seguro e fácil?". Medido no código:
- A rota `/` (`routes/index.tsx`, ~1300 linhas) é a CASA do jogo: login, save, HUD, painéis, cidade (Clash), PvP,
  multiplayer, store. O mundo 3D é UMA peça dela (`<GameWorld …/>`). A Zona Sul hoje é outra rota, sem nada disso.
- As regras (`game/systems`, 38 sistemas) são puras e recebem a altura de fora (`heightAt`) → servem em qualquer mapa.
- Todas as peças 3D do mundo velho (24 arquivos) perguntam o chão a UM balcão: `world/terrain-collision.ts`
  (raio no GLB). Trocando o que esse balcão responde, elas pisam no chão da Zona Sul sem reescrever uma por uma.
- As POSIÇÕES fixas (acampamentos, nós, zona segura, nascedouro, cavernas — `game/data/camps.ts` etc.) são do mapa
  velho de 180×180 m; a Zona Sul tem 1600×1056 m. Precisam de um arquivo de posições novo — nas DUAS opções.

Por isso nenhuma opção "pura":
- ✗ Trazer tudo pra `/zona-sul` = duplicar login/save/HUD/painéis/cidade/PvP → dois jogos pra manter.
- ✗ Arrancar o mapa velho e pôr a Zona Sul no lugar de uma vez = as 24 peças quebram juntas; jogo fora do ar pros outros.
- ✓ A casa fica; o mundo vira uma CHAVE: "Clássico" | "Zona Sul" no mesmo jogo, mesmo save. Clássico é o padrão
  até a Zona Sul ter paridade; aí vira o contrário (só com OK do Pedro). `/zona-sul` continua funcionando.

## Checklist completa (cada caixa fecha com teste; cada fase com build + FPS + Pedro testa no ar + diário)
**Fase 0 · Fundação**
- [ ] Chave de mapa na casa do jogo (`/`), lembrada por conta; Clássico padrão
- [ ] Mundo da Zona Sul recebe as mesmas entradas do `GameWorld` (modo, ataque, coletar, posição, pausa, câmera)
- [ ] Ponte de chão: `terrain-collision` responde com o mapa de altura quando a Zona Sul está montada (Clássico intocado)
- [ ] Arquivo de posições da Zona Sul (nascedouro, zona segura, acampamentos, nós, locais de base), validado pelo
      mesmo checador do velho + "não cai na água / morro íngreme"
- [ ] Prancha no catálogo oficial de itens; save aceita; validar com saves REAIS do banco (lição nv 38)
- [ ] Hotbar/I da Zona Sul = inventário de verdade (sai a cópia só-leitura)
- [ ] Posição salva POR MAPA (voltar pro Clássico não te joga no mar)
- [ ] Herói único: andar/carro/prancha/nado da Zona Sul + armas/poderes/esquiva do jogo, no mesmo controle
- [ ] Celular: botões do carro e da prancha

**Fase 1 · Combate** — armas na mão, mira de ombro, Q/R/Z/X/C/F, munição, poções, tiro bate no morro (mapa de altura),
morte/renascer na zona segura, vida/dano na tela, piloto de mira

**Fase 2 · Fauna e farm** — bichos por região real, árvores/pedras farmáveis, perigo pela geografia, dia/noite,
animação e sombra por distância (orçamento desde o 1º dia)

**Fase 3 · Acampamentos + chefe + piloto** — ruínas reais com fogueira, chefe a cada 15 min, piloto com a regra selada,
o piloto sabe que mar não é chão (anda/nada/desvia)

**Fase 4 · Base, hordas e cidade** — reivindicar sobre o mapa de altura, locais escolhidos pelo Pedro, muros/torres/casas,
hordas com intervalo maior, cartas, cidade (Clash), armazém, tropas

**Fase 5 · Online** — salas, host, outros jogadores, carro/prancha/onda iguais pra todos (série da onda pelo relógio da sala), PvP

**Fase 6 · Raid e cerco** — raid na base, tropas tank, bazuca −40% muro, saco de loot visível

**Virada** — Zona Sul vira padrão; Clássico fica no menu ou sai — só com OK do Pedro

## Decisões do Pedro antes de começar
1. **Um personagem só nos dois mapas?** (recomendado: sim — mesmo save)
2. **Quando a Zona Sul vira o mapa principal** (e o velho sai do menu)? (recomendado: ao fechar a Fase 4)
3. **Onde nasce o jogador** (hoje: praia do Arpoador) e **zona segura** (proposta: a orla).
4. Go na Fase 0.
