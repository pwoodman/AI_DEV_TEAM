import type { Item } from "./item.js";
export const store: Item[] = Array.from({ length: 25 }, (_, i) => ({
  id: `item-${String(i + 1).padStart(2, "0")}`,
  name: `Item ${i + 1}`,
}));
