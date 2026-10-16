import { describe, expect, it } from "vitest";
import { normalizeSku } from "../../src/modules/products/sku.js";

describe("normalizeSku", () => {
  it("converts to uppercase", () => {
    expect(normalizeSku("rs-001")).toBe("RS-001");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeSku("  RS-001  ")).toBe("RS-001");
  });

  it("trims and uppercases together", () => {
    expect(normalizeSku("  rs-001 ")).toBe("RS-001");
  });

  it("leaves already normalized values unchanged", () => {
    expect(normalizeSku("RS-001")).toBe("RS-001");
  });
});
