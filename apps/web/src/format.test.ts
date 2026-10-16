import { describe, expect, it } from "vitest";
import { estimateSubtotal, formatMoney, formatWeight } from "./format.js";

describe("formatMoney", () => {
  it("formats decimal strings as USD", () => {
    expect(formatMoney("19.99")).toBe("$19.99");
    expect(formatMoney("0.05")).toBe("$0.05");
    expect(formatMoney("1000")).toBe("$1,000.00");
  });
});

describe("formatWeight", () => {
  it("appends the kilogram unit without changing the value", () => {
    expect(formatWeight("0.350")).toBe("0.350 kg");
  });
});

describe("estimateSubtotal", () => {
  it("multiplies exactly without floating-point drift", () => {
    expect(estimateSubtotal([{ price: "0.10", quantity: 3 }])).toBe("0.30");
    expect(
      estimateSubtotal([
        { price: "19.99", quantity: 2 },
        { price: "0.10", quantity: 3 },
      ]),
    ).toBe("40.28");
    expect(estimateSubtotal([])).toBe("0.00");
  });
});
