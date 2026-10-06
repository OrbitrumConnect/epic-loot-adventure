export type InventorySlot = {
  itemId: string | null;
  quantity: number;
};

export type EquipmentSlots = {
  primary: string | null;
  secondary: string | null;
  armor: string | null;
  accessory: string | null;
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
