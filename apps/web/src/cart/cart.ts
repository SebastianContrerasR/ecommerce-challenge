export interface CartProductSnapshot {
  id: string;
  name: string;
  sku: string;
  price: string;
  stock: number;
  archivedAt: string | null;
}

export interface CartEntry {
  product: CartProductSnapshot;
  quantity: number;
}

export function clampQuantity(quantity: number, stock: number): number {
  if (stock <= 0) {
    return 0;
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    return 1;
  }
  return Math.min(quantity, stock);
}

export function addToCart(
  entries: CartEntry[],
  product: CartProductSnapshot,
  quantity: number,
): CartEntry[] {
  if (product.archivedAt !== null || product.stock <= 0) {
    return entries;
  }
  const existing = entries.find((entry) => entry.product.id === product.id);
  const nextQuantity = clampQuantity((existing?.quantity ?? 0) + quantity, product.stock);
  if (existing !== undefined) {
    return entries.map((entry) =>
      entry.product.id === product.id ? { product, quantity: nextQuantity } : entry,
    );
  }
  return [...entries, { product, quantity: nextQuantity }];
}

export function setEntryQuantity(
  entries: CartEntry[],
  productId: string,
  quantity: number,
): CartEntry[] {
  return entries.map((entry) =>
    entry.product.id === productId
      ? { ...entry, quantity: clampQuantity(quantity, entry.product.stock) }
      : entry,
  );
}

export function removeFromCart(entries: CartEntry[], productId: string): CartEntry[] {
  return entries.filter((entry) => entry.product.id !== productId);
}

export function cartItemCount(entries: CartEntry[]): number {
  return entries.reduce((total, entry) => total + entry.quantity, 0);
}
