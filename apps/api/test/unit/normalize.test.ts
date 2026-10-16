import { describe, expect, it } from "vitest";
import { hashOrderRequest, normalizeOrderItems } from "../../src/modules/orders/normalize.js";

describe("normalizeOrderItems", () => {
  it("sorts lines by product id", () => {
    expect(
      normalizeOrderItems([
        { productId: "b", quantity: 1 },
        { productId: "a", quantity: 2 },
      ]),
    ).toEqual([
      { productId: "a", quantity: 2 },
      { productId: "b", quantity: 1 },
    ]);
  });

  it("merges duplicate product ids by summing quantities", () => {
    expect(
      normalizeOrderItems([
        { productId: "a", quantity: 2 },
        { productId: "b", quantity: 1 },
        { productId: "a", quantity: 3 },
      ]),
    ).toEqual([
      { productId: "a", quantity: 5 },
      { productId: "b", quantity: 1 },
    ]);
  });
});

describe("hashOrderRequest", () => {
  it("produces the same hash regardless of line order or splitting", () => {
    const first = hashOrderRequest(
      normalizeOrderItems([
        { productId: "b", quantity: 1 },
        { productId: "a", quantity: 2 },
      ]),
    );
    const second = hashOrderRequest(
      normalizeOrderItems([
        { productId: "a", quantity: 1 },
        { productId: "b", quantity: 1 },
        { productId: "a", quantity: 1 },
      ]),
    );
    expect(first).toBe(second);
  });

  it("produces different hashes for different payloads", () => {
    const first = hashOrderRequest([{ productId: "a", quantity: 1 }]);
    const second = hashOrderRequest([{ productId: "a", quantity: 2 }]);
    const third = hashOrderRequest([{ productId: "b", quantity: 1 }]);
    expect(first).not.toBe(second);
    expect(first).not.toBe(third);
  });
});
