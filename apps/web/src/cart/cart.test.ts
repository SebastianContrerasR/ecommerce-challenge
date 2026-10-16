import { describe, expect, it } from "vitest";
import {
  addToCart,
  cartItemCount,
  clampQuantity,
  removeFromCart,
  setEntryQuantity,
} from "./cart.js";
import type { CartProductSnapshot } from "./cart.js";

function product(overrides: Partial<CartProductSnapshot> = {}): CartProductSnapshot {
  return {
    id: "product-1",
    name: "Widget",
    sku: "W-001",
    price: "19.99",
    stock: 5,
    archivedAt: null,
    ...overrides,
  };
}

describe("clampQuantity", () => {
  it("keeps quantities within available stock", () => {
    expect(clampQuantity(3, 5)).toBe(3);
    expect(clampQuantity(9, 5)).toBe(5);
    expect(clampQuantity(0, 5)).toBe(1);
    expect(clampQuantity(-2, 5)).toBe(1);
    expect(clampQuantity(2.5, 5)).toBe(1);
  });

  it("returns zero when nothing is available", () => {
    expect(clampQuantity(3, 0)).toBe(0);
  });
});

describe("addToCart", () => {
  it("adds new lines and accumulates existing ones up to stock", () => {
    const first = addToCart([], product(), 2);
    expect(first).toHaveLength(1);
    const second = addToCart(first, product(), 2);
    expect(second[0]?.quantity).toBe(4);
    const capped = addToCart(second, product(), 5);
    expect(capped[0]?.quantity).toBe(5);
  });

  it("refuses archived and out-of-stock products", () => {
    expect(addToCart([], product({ archivedAt: "2024-01-01T00:00:00.000Z" }), 1)).toEqual([]);
    expect(addToCart([], product({ stock: 0 }), 1)).toEqual([]);
  });
});

describe("setEntryQuantity", () => {
  it("clamps edited quantities to stock", () => {
    const entries = addToCart([], product(), 2);
    expect(setEntryQuantity(entries, "product-1", 99)[0]?.quantity).toBe(5);
    expect(setEntryQuantity(entries, "product-1", 0)[0]?.quantity).toBe(1);
  });
});

describe("removeFromCart", () => {
  it("removes only the matching line", () => {
    const entries = [
      ...addToCart([], product(), 1),
      ...addToCart([], product({ id: "product-2", sku: "W-002" }), 2),
    ];
    const remaining = removeFromCart(entries, "product-1");
    expect(remaining.map((entry) => entry.product.id)).toEqual(["product-2"]);
  });
});

describe("cartItemCount", () => {
  it("totals quantities across lines", () => {
    const entries = [
      ...addToCart([], product(), 2),
      ...addToCart([], product({ id: "product-2", sku: "W-002" }), 3),
    ];
    expect(cartItemCount(entries)).toBe(5);
    expect(cartItemCount([])).toBe(0);
  });
});
