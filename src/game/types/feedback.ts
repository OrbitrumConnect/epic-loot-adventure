import type { Position } from './player';

/**
 * Eventos efêmeros de combate e coleta.
 *
 * Existem só para o mundo 3D e o HUD mostrarem o que acabou de acontecer
 * (número de dano, sangue, barra caindo, XP, loot). Não são estado do jogo:
 * quem decide dano, morte e loot continua sendo o sistema, e estes eventos
 * são o eco visual disso. Somem sozinhos depois de `ttl`.
 */
export type FeedbackKind =
  | 'damage'       // alguém levou dano
  | 'heal'         // alguém se curou
  | 'death'        // alvo morreu
  | 'xp'           // experiência ganha
  | 'loot'         // item recebido
  | 'levelup'      // subiu de nível
  | 'harvest';     // recurso colhido

export type FeedbackEvent = {
  id: number;
  kind: FeedbackKind;
  /** Onde aconteceu, no mundo. O HUD ignora; o mundo 3D usa para posicionar. */
  position: Position;
  /** Quem sofreu/recebeu: id da criatura, ou `player`. */
  targetId: string;
  /** Rótulo pronto em português, quando faz sentido mostrar texto. */
  label: string;
  /** Dano, cura, XP ou quantidade colhida. */
  amount: number;
  /** `loot`/`harvest`: id do item, para o sprite. */
  itemId?: string;
  /** `damage`: foi o jogador quem levou? Muda a cor e o efeito. */
  onPlayer?: boolean;
  /** `damage`: golpe crítico, para um efeito mais forte. */
  critical?: boolean;
  /** `damage`: dano de fogo (tocha) — número laranja e faíscas de chama. */
  fire?: boolean;
  createdAt: number;
  /** Duração em milissegundos antes de sumir. */
  ttl: number;
};

/** Barra de vida flutuante: o que o mundo precisa saber para desenhar. */
export type HealthBarInfo = {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  position: Position;
  hostile: boolean;
  /** Alvo selecionado ou objetivo ativo: desenhar em destaque. */
  highlighted: boolean;
};
