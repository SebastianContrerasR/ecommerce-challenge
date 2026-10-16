import { createHash } from "node:crypto";

export interface OrderLineInput {
  productId: string;
  quantity: number;
}

export function normalizeOrderItems(items: OrderLineInput[]): OrderLineInput[] {
  const quantities = new Map<string, number>();
  for (const item of items) {
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
  }
  return [...quantities.entries()]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((left, right) => (left.productId < right.productId ? -1 : 1));
}

export function hashOrderRequest(items: OrderLineInput[]): string {
  const canonical = JSON.stringify(items.map((item) => ({ p: item.productId, q: item.quantity })));
  return createHash("sha256").update(canonical).digest("hex");
}
