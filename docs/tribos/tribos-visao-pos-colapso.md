---
name: tribos-visao-pos-colapso
description: "DIREÇÃO OFICIAL (selada Pedro 07/10): TRIBOS é sobrevivência + reconstrução de civilização num mundo pós-colapso. Infraestrutura sobreviveu, a civilização não. Combate/raid/base SERVEM essa fantasia. Lente que afia o Doc Mestre."
metadata:
  node_type: memory
  type: project
  modified: 2026-10-07
---

# TRIBOS — Leitura Central: Mundo Pós-Colapso (direção oficial, selada 07/10)

> Esta é a **lente** que orienta TODA decisão de desenvolvimento daqui pra frente. Não
> substitui nem apaga o [[tribos-documento-mestre]] nem as [[tribos-3-camadas]] — **afia** o
> centro de gravidade deles. Em caso de dúvida de prioridade, passar a ideia por aqui primeiro.

## A fantasia central

TRIBOS é um jogo de **sobrevivência e reconstrução de civilização num mundo pós-colapso**.

Um evento catastrófico reduziu drasticamente a população. A **infraestrutura física sobreviveu
em parte** — cidades, fábricas, usinas, depósitos, estradas, hospitais, oficinas, portos — mas a
**civilização não**. O jogador começa pequeno: sobrevive, explora e **recupera pedaços desse mundo**.

A fantasia **não** é "matar monstro + pegar loot + upar personagem". É:

> "Eu sobrevivi. O que vou fazer hoje pra continuar vivo — e, aos poucos, reconstruir alguma coisa?"

## O que muda (centro de gravidade)

| Antes (tratado como) | Agora (direção oficial) |
|---|---|
| Survival + MOBA + Clash | Sobrevivência + **reconstrução de civilização** |
| matar → loot → craft → upgrade → repetir | EXPLORAR → SOBREVIVER → CONQUISTAR → REPARAR → PRODUZIR → NEGOCIAR → EXPANDIR → PROTEGER |
| Base = tela de upgrade | Base = lugar seguro e **produtivo** que se constrói |
| Matar lobo / upar = objetivo | Combate **serve** exploração, conquista, defesa de produção/rotas |
| Mundo é cenário de farm | Mundo começa **parcialmente morto** e é reconstruído pelos jogadores |
| PvP por PvP | PvP com **significado econômico** (recurso, rota, estrutura, produção, território) |

O jogador não só "sobe de nível" — ele deixa uma **marca física/econômica** no mundo.

## O exemplo-âncora: a fábrica abandonada

```
FÁBRICA ABANDONADA
  → explorar → eliminar ameaça → tomar posse → descobrir danos
  → precisa de: 20 aço, 5 componentes elétricos, 1 gerador
  → explorar / negociar → RESTAURAR → produção começa
  → outros jogadores precisam dos seus produtos → COMÉRCIO
  → sua região ganha importância
```

**Nota de colocação (Pedro, 07/10):** a fábrica (e estruturas recuperáveis em geral) funciona
**como as zonas de acampamento** que já existem — só que **menos raras e mais espalhadas** pelo mapa.
Reusa o padrão de dado que já temos: lista de colocações + `findPlacementIssues` (valida posição em
código, por tier/distância do spawn). Ou seja, não é sistema novo do zero — é **estender o que já existe**
(camps → estruturas recuperáveis com estado danificado→reparado).

Isso cria a sensação "acordei — e agora, o que eu faço?". O mundo **gera problemas**
(usina sem combustível, lobo ocupou mineração, comerciante com a peça que falta, rota cortada,
fábrica precisa de manutenção, outra tribo quer comprar sua produção, surgiu estrutura pra conquistar).
Mais interessante que uma lista fixa de quests.

## Economia emergente (especialização)

Nenhum jogador produz tudo. Jogadores/regiões se especializam naturalmente:
usina→energia · agricultura→alimento · oficina→componentes · fábrica→produtos · refinaria→combustível ·
laboratório→medicamentos · mineração→minério · logística→transporte · comunicação→informação.

Uma estrutura recuperada **aumenta o valor econômico da região**. **Infraestrutura = poder econômico.**
O mapa vira **geografia econômica** (esta cidade tem fábrica de componentes; esta região tem usina; este porto dá logística; esta área tem minério raro).

## Princípio fundamental

O mundo **começa parcialmente morto** (prédios abandonados, pouca luz, estradas bloqueadas,
estruturas danificadas, criaturas, poucos recursos, zero produção) e é **progressivamente
reconstruído** pelos jogadores (energia volta, fábricas funcionam, rotas abrem, comércio surge,
comunidades crescem, regiões ficam relevantes).

## Como o que já existe serve a fantasia

- **Combate (lobos/criaturas):** camada de sobrevivência; permite exploração, conquista de estrutura, defesa de território/rota/produção. Não é o fim.
- **Base (Camada 3):** o lugar seguro e produtivo; vira o mapa que inimigos enfrentam na raid. Ver [[tribos-tribo-base-comum]].
- **Raid/PvP (Camada 2):** motivo **contextual** — recurso, rota, estrutura, produção, posição, território, infraestrutura.
- **Acesso por preparo, não por porta:** se chegou fisicamente, pode tentar. Geografia define o perigo; sem level-gate; instância adapta a forma da ameaça, não a identidade. Regra selada em [[tribos-nivel-nao-e-porta]].
- **Mapa (Camada 1):** mundo com infraestrutura recuperável; estruturas têm identidade e função.
- **Dia/noite (já implementado):** base da tensão de sobrevivência (waves à noite, manutenção, ameaça).

## Princípio de design (filtro)

Não criar sistema só porque é comum em survival. Perguntar sempre:
**"Isso aumenta a sensação de sobrevivência, reconstrução, dependência ou interação entre jogadores?"**
Se não aumenta, não é prioridade. (Alinha com o filtro §95 do [[tribos-modo-de-trabalho]].)

## O que NÃO fazer agora

Economia completa, marketplace complexo, multiplayer completo, 300×300 definitivo, milhares de
estruturas, blockchain/token, sistemas financeiros reais, refatoração visual, novos sistemas
aleatórios. **Primeiro consolidar a fundação.**

## Próxima prioridade técnica

Fundação técnica antes de qualquer fábrica. Itens do roadmap:
- Zoom de câmera — **FEITO (sessão 8, 07/10)**
- Colisão de câmera — **FEITO (sessão 8, 07/10)**
- Click inteligente (raycast → criatura=attack / recurso=interact / chão=move) — pendente
- Hit stop — pendente
- Hit reaction — pendente

**Depois**, o primeiro grande teste: um **único vertical slice** que prova a fantasia —
explorar → achar uma estrutura abandonada → enfrentar ameaça → descobrir que está danificada →
achar parte dos recursos → perceber que um recurso depende de outra estrutura/jogador → reparar →
produzir → usar/trocar. **Uma fábrica abandonada funcionando de verdade.** Se ficar divertido,
achamos o núcleo do jogo.

A pergunta deixa de ser "qual feature agora?" e passa a ser:
**"Qual é a menor implementação que prova que esse mundo realmente funciona?"**

## Regras absolutas (reafirmadas)

- Não apagar o que já funciona. Não trocar arquitetura sem necessidade. Não criar feature por impulso.
- **Controles fixos:** Space=PULO · Click esquerdo=ATTACK · Shift=SPRINT · V=câmera · B=cidade.
- Zero regressão (136 testes verdes antes e depois). Diário + memória a cada passo. Não force push (Lovable).
