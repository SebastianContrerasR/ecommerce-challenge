import type { OrderLineInput } from "./normalize.js";

export interface PricedOrderLine {
  productId: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

export function priceStringToCents(price: string): bigint {
  const dot = price.indexOf(".");
  if (dot === -1) {
    return BigInt(price) * 100n;
  }
  const whole = price.slice(0, dot);
  const fraction = (price.slice(dot + 1) + "00").slice(0, 2);
  return BigInt(whole === "" ? "0" : whole) * 100n + BigInt(fraction);
}

export function formatCents(cents: bigint): string {
  return `${(cents / 100n).toString()}.${(cents % 100n).toString().padStart(2, "0")}`;
}

export function calculateOrderLines(
  items: OrderLineInput[],
  unitPriceByProductId: Map<string, string>,
): { lines: PricedOrderLine[]; total: string } {
  const lines = items.map((item) => {
    const unitPrice = unitPriceByProductId.get(item.productId);
    if (unitPrice === undefined) {
      throw new Error(`Missing price for product: ${item.productId}`);
    }
    return {
      productId: item.productId,
      quantity: item.quantity,
      unitPrice,
      lineTotal: formatCents(priceStringToCents(unitPrice) * BigInt(item.quantity)),
    };
  });
  const total = formatCents(
    lines.reduce((sum, line) => sum + priceStringToCents(line.lineTotal), 0n),
  );
  return { lines, total };
}
