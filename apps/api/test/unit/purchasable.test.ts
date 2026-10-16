import { describe, expect, it } from "vitest";
import {
  getPurchaseBlockReason,
  isProductPurchasable,
} from "../../src/modules/products/purchasable.js";

describe("product purchasability", () => {
  it("treats active products as purchasable", () => {
    expect(getPurchaseBlockReason({ archivedAt: null })).toBe(null);
    expect(isProductPurchasable({ archivedAt: null })).toBe(true);
  });

  it("blocks archived products with a stable reason", () => {
    expect(getPurchaseBlockReason({ archivedAt: new Date() })).toBe("PRODUCT_ARCHIVED");
    expect(isProductPurchasable({ archivedAt: new Date() })).toBe(false);
  });

  it("blocks archived products represented as strings", () => {
    expect(getPurchaseBlockReason({ archivedAt: new Date().toISOString() })).toBe(
      "PRODUCT_ARCHIVED",
    );
  });
});
