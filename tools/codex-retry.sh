#!/usr/bin/env bash
# Roda um briefing no Codex e RETOMA sozinho quando a cota voltar.
#
# Por que existe: a cota do Codex acaba no meio do trabalho e volta algumas
# horas depois. Sem isto, alguem precisa perceber e disparar de novo na mao.
#
# Uso:  tools/codex-retry.sh <arquivo-do-briefing> <arquivo-de-log> [modelo] [esforco]
# Ex.:  tools/codex-retry.sh brief.md out.log gpt-6-astra medium
#
# Para quando: o Codex termina sem erro de cota, ou estoura MAX_TENTATIVAS.
set -u
BRIEF="${1:?briefing faltando}"
LOG="${2:?log faltando}"
MODELO="${3:-gpt-6-astra}"
ESFORCO="${4:-medium}"
ESPERA_S="${ESPERA_S:-900}"        # 15 min entre tentativas
MAX_TENTATIVAS="${MAX_TENTATIVAS:-40}"   # ~10 h de cobertura

# Marcas que o Codex imprime quando a cota acaba. Se a mensagem mudar, a
# tentativa seguinte simplesmente roda de novo — falha fechada, nao aberta.
PADRAO_COTA='usage limit|rate limit|quota|exceeded your|try again at|limite de uso'

for ((i=1; i<=MAX_TENTATIVAS; i++)); do
  echo "[$(date '+%H:%M:%S')] tentativa $i/$MAX_TENTATIVAS — modelo $MODELO esforco $ESFORCO" >> "$LOG.retry"
  codex exec -s workspace-write -m "$MODELO" -c "model_reasoning_effort=\"$ESFORCO\"" - < "$BRIEF" > "$LOG" 2>&1
  CODIGO=$?

  if grep -qiE "$PADRAO_COTA" "$LOG"; then
    QUANDO=$(grep -ioE 'try again at [^.]*' "$LOG" | head -1)
    echo "[$(date '+%H:%M:%S')] COTA ESGOTADA ${QUANDO:+($QUANDO)} — nova tentativa em $((ESPERA_S/60)) min" >> "$LOG.retry"
    cp "$LOG" "$LOG.tentativa-$i" 2>/dev/null
    sleep "$ESPERA_S"
    continue
  fi

  echo "[$(date '+%H:%M:%S')] CONCLUIDO na tentativa $i (exit $CODIGO)" >> "$LOG.retry"
  exit "$CODIGO"
done

echo "[$(date '+%H:%M:%S')] DESISTIU apos $MAX_TENTATIVAS tentativas — cota nao voltou" >> "$LOG.retry"
exit 75   # EX_TEMPFAIL: falhou por indisponibilidade temporaria, nao por erro da tarefa
