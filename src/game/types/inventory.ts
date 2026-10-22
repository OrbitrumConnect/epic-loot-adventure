export type InventorySlot = {
  itemId: string | null;
  quantity: number;
};

export type EquipmentSlots = {
  primary: string | null;
  secondary: string | null;
  armor: string | null;
  accessory: string | null;
  head?: string | null;
  gloves?: string | null;
  legs?: string | null;
  boots?: string | null;
  amulet?: string | null;
  ring1?: string | null;
  ring2?: string | null;
};

export type HotbarState = {
  slots: Array<number | null>;
};

export type InventoryState = {
  slots: InventorySlot[];
  maxSlots: number;
  maxWeight: number;
  equipment: EquipmentSlots;
  hotbar: HotbarState;
};
