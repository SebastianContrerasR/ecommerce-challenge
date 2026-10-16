import { describe, expect, it } from "vitest";
import {
  calculateOrderLines,
  formatCents,
  priceStringToCents,
} from "../../src/modules/orders/totals.js";

describe("priceStringToCents", () => {
  it("converts whole and fractional prices without floating point", () => {
    expect(priceStringToCents("89.99")).toBe(8999n);
    expect(priceStringToCents("10")).toBe(1000n);
    expect(priceStringToCents("0.05")).toBe(5n);
    expect(priceStringToCents("0.00")).toBe(0n);
    expect(priceStringToCents("9999999999.99")).toBe(999999999999n);
  });

  it("formats cents back to exact two-decimal strings", () => {
    expect(formatCents(8999n)).toBe("89.99");
    expect(formatCents(5n)).toBe("0.05");
    expect(formatCents(0n)).toBe("0.00");
  });
});

describe("calculateOrderLines", () => {
  it("computes server-side line totals and order total exactly", () => {
    const prices = new Map([
      ["product-a", "19.99"],
      ["product-b", "0.10"],
    ]);
    const result = calculateOrderLines(
      [
        { productId: "product-a", quantity: 3 },
        { productId: "product-b", quantity: 3 },
      ],
      prices,
    );
    expect(result.lines).toEqual([
      { productId: "product-a", quantity: 3, unitPrice: "19.99", lineTotal: "59.97" },
      { productId: "product-b", quantity: 3, unitPrice: "0.10", lineTotal: "0.30" },
    ]);
    expect(result.total).toBe("60.27");
  });

  it("keeps fractional-cent products exact across quantities", () => {
    const prices = new Map([["product-a", "0.07"]]);
    const result = calculateOrderLines([{ productId: "product-a", quantity: 7 }], prices);
    expect(result.lines[0]?.lineTotal).toBe("0.49");
    expect(result.total).toBe("0.49");
  });

  it("requires a price for every line", () => {
    expect(() => calculateOrderLines([{ productId: "missing", quantity: 1 }], new Map())).toThrow();
  });
});
