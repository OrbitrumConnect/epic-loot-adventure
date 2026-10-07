/**
 * Estado do piloto automático exposto fora do laço de quadro.
 *
 * O laço de quadro NÃO pode chamar setState do React. Então ele escreve aqui
 * (objeto mutável, sem alocação) e o HUD lê por polling leve (4x/s).
 */
export type PilotStatus = {
  /** Tipo da intenção atual (`move`, `attack`, ...) ou 'off'. */
  kind: string;
  /** Frase em português para mostrar no HUD. */
  label: string;
  /** Detalhe curto (alvo, motivo). */
  detail: string;
  updatedAt: number;
};

const status: PilotStatus = { kind: 'off', label: 'Piloto desligado', detail: '', updatedAt: 0 };

export function setPilotStatus(kind: string, label: string, detail = '') {
  if (status.kind === kind && status.label === label && status.detail === detail) return;
  status.kind = kind;
  status.label = label;
  status.detail = detail;
  status.updatedAt = Date.now();
}

/** Cópia rasa — o HUD compara campos para evitar re-render desnecessário. */
export function readPilotStatus(): PilotStatus {
  return status;
}

export const INTENT_LABEL: Record<string, string> = {
  idle: 'Aguardando',
  move: 'Indo até o objetivo',
  attack: 'Atacando',
  gather: 'Coletando',
  heal: 'Usando cura',
  retreat: 'Recuando',
  off: 'Piloto desligado',
};
