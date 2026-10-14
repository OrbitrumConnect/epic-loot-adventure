# Consumo de token no Codex — por que a cota estoura, e a regra que adotamos

Medido em 2026-10-14 sobre `~/.codex/sessions/**/*.jsonl` (1.258 arquivos, 800 com uso registrado). Cada turno grava um `token_usage_record` com `usage`: input, `cached_input`, output e `reasoning_output`.

## A regra

**Uma fase, uma sessão.** Abrir uma sessão nova do Codex para cada fase de um briefing. Não rodar duas fases na mesma sessão, nem o briefing inteiro de uma vez. Se a sessão passar de ~50 turnos no meio de uma fase, commitar o que está pronto e continuar em sessão nova.

## Por que — o esforço do modelo não é o culpado

| modelo | tokens/turno | sessões | tokens/sessão |
|---|---|---|---|
| `gpt-6-luna` | 130k | 3 | 54,92M |
| `gpt-reserve` | 127k | 22 | 9,12M |
| `gpt-6-astra` | 99k | 35 | 5,28M |
| `gpt-5.6-luna` | 59k | 502 | 811k |

Por **turno**, o Astra custa 1,7× o Luna. Por **sessão**, custa 6,5×. A diferença não está no modelo — está em quantos turnos a sessão dura.

E o raciocínio não é o gasto: dos 208,06M de tokens do Astra, **207,33M são input** e só 731k são output. O `reasoning_output` inteiro são 146,7k, ou **0,07% do total**. Baixar o esforço de médio para baixo não move o ponteiro.

## O que realmente gasta: o contexto reenviado

Cada turno reenvia a conversa inteira. Medido numa sessão real deste projeto, 203 turnos, Astra:

| turnos | input médio por turno |
|---|---|
| 1–20 | 43k |
| 41–60 | 105k |
| 102–121 | 147k |
| **143–162** | **175k** |
| 163–182 | 79k ← compactação entrou |

Ritmo medido: **+915 tokens de input por turno**. Como isso é cobrado a cada turno, o custo total cresce ao quadrado do tamanho da sessão. Essa sessão sozinha queimou **23,46M**. A maior já registrada, em outro projeto, foi **62,98M em 511 turnos**.

O contexto base custa **35k** no primeiro turno. Toda sessão nova recomeça barata.

## Quanto se economiza

Simulação com o ritmo de crescimento medido, mesma quantidade de trabalho:

| partido em | custo | economia |
|---|---|---|
| 100 turnos | 16,25M | 30,7% |
| 50 turnos | 11,68M | 50,2% |
| 25 turnos | 9,39M | 60,0% |

## Onde o crédito foi

| projeto | total |
|---|---|
| sidequest-archive | 408,53M |
| epic-loot-adventure | 262,60M |
| poke-website | 117,62M |
| draw-space-game | 87,56M |

Por dia, o pico foi **10/10 com 213,57M** — mais que os quatro dias anteriores somados.

## Ressalva honesta

**96,7% do input do Astra está marcado como `cached_input_tokens`.** Se o Codex cobra cache mais barato na cota, a economia real é menor que os 50–60% simulados. O log registra o volume, não a política de cobrança, e essa política não foi verificada. Os percentuais acima são o teto, não a garantia.

## Como refazer a medição

Ler `~/.codex/sessions/**/*.jsonl`, somar `payload.usage` agrupando por `turn_context.model` e `turn_context.cwd`. Atenção no Windows: o Python não enxerga o caminho `/c/...` do Git Bash — usar `C:/...`.
