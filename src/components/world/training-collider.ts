/** Cada centro publica seu footprint; nunca substitui o singleton da casa. */
export type TrainingCollider = {
  pieceId: string;
  cx: number;
  cz: number;
  halfX: number;
  halfZ: number;
};

export const trainingColliders: TrainingCollider[] = [];
