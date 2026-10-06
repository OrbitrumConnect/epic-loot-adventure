export type CombatEntity = {
  id: string;
  hp: number;
  maxHp: number;
  armor: number;
  attackPower: number;
  attackCooldown: number;
  lastAttackAt: number;
  position: { x: number; z: number };
};

export type AttackResult = {
  hit: boolean;
  damage: number;
  targetHp: number;
  targetDied: boolean;
  message: string;
};
