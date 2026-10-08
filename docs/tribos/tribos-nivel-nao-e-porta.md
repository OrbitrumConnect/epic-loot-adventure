---
name: tribos-nivel-nao-e-porta
description: "DECISÃO OFICIAL (selada Pedro 07/10): nível é medida de preparo, não porta. Sem level-gate no overworld nem na raid. Geografia define o perigo; instância adapta a FORMA da ameaça, nunca a IDENTIDADE pra facilitar. Só documentação — não implementar."
metadata:
  node_type: memory
  type: project
  modified: 2026-10-07
---

# TRIBOS — Nível não é porta (decisão oficial, selada 07/10)

> **Frase canônica:** «Nível é medida de preparo, não porta.»
> **Complementar:** «A região define o perigo; a operação adapta a FORMA da ameaça, não sua IDENTIDADE.»

Lente de aplicação: ver [[tribos-visao-pos-colapso]] e [[tribos-documento-mestre]]. Decisão
arquitetural/de design. **Não implementar ainda. Não criar sistema de waves agora. Não alterar código.**

## Regra

Se o jogador consegue **chegar fisicamente** a uma região ou estrutura, ele **pode tentar entrar**,
independentemente do nível. **Não criar level-gates artificiais** no overworld nem bloquear acesso a
Raid/Operação só por nível. O jogador não recebe *autorização* para viver o mundo — ele precisa ter
**coragem/preparo** para sobreviver a ele.

## Overworld (compartilhado e persistente)

A dificuldade dos inimigos pertence à **região, estrutura e estado do mundo** — não ao jogador.
- região T1 continua T1; região T5 continua T5;
- dois jogadores na mesma região encontram essencialmente a **mesma** ameaça;
- o nível individual **não reduz** a dificuldade do mundo;
- **não existe level-scaling individual** dos inimigos do overworld.

Um jogador de nível baixo pode entrar numa região muito acima do seu preparo — **isso é intencional**.
Ele pode: fugir, morrer, explorar com cuidado, voltar depois, chamar outros, formar expedição,
negociar, ou achar uma rota alternativa.

## Telegraph de perigo (dependência da regra)

Sem level-gate, o **mundo** comunica o perigo fisicamente — não uma mensagem burocrática de UI
("Nível insuficiente"). Sinais: cadáveres, ruínas, estruturas destruídas, inimigos visivelmente mais
ameaçadores, acampamentos maiores, equipamentos encontrados, comportamento das criaturas, sinais
ambientais, distância da região segura, estado da infraestrutura. O jogador **aprende a geografia do perigo**.

## Raid / Instância — adaptação ≠ level scaling livre

Dentro de uma operação instanciada **pode** existir adaptação dinâmica. Mas:
- A **região define a identidade e o piso/teto** da ameaça.
- A operação pode adaptar: **quantidade, composição, comportamento, rotas, timing, pressão, objetivos secundários.**
- A operação **NÃO pode** adaptar a **identidade** da ameaça pra facilitar: uma operação T5 **nunca** vira T1 porque entrou um jogador fraco.

> A instância pode adaptar a **forma** da ameaça, mas não pode adaptar a **identidade** da ameaça para facilitar o jogador.

## Princípio

- **OVERWORLD:** a geografia define o perigo.
- **INSTÂNCIA:** a geografia define a identidade da operação + o desempenho/preparo do grupo pode adaptar a composição **dentro dos limites daquela região**.

## Exemplo

Jogador nível 6 chega fisicamente a uma instalação T5. **Não existe** "Nível mínimo 40." Ele entra.
A 1ª wave pode funcionar como **reconhecimento**; o sistema observa desempenho real (dano, dano
recebido, tempo, perdas, eficiência, progresso, composição) e adapta a **pressão dentro da faixa do
T5** — mas **nunca** reduz a operação pra uma dificuldade incompatível com a identidade dela.

## O que NÃO fazer agora

Não implementar waves, não criar o sistema de operação, não mexer em código. Isto é **direção** — o
código futuro precisa respeitar, não executar agora.
