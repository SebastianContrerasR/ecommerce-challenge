import { describe, expect, it } from "vitest";
import { buildErrorEnvelope } from "../../src/utils/errorEnvelope.js";

describe("buildErrorEnvelope", () => {
  it("builds an envelope without details", () => {
    expect(buildErrorEnvelope("NOT_FOUND", "Missing")).toEqual({
      error: { code: "NOT_FOUND", message: "Missing" },
    });
  });

  it("builds an envelope with details", () => {
    expect(buildErrorEnvelope("VALIDATION_ERROR", "Invalid", { field: "sku" })).toEqual({
      error: { code: "VALIDATION_ERROR", message: "Invalid", details: { field: "sku" } },
    });
  });
});
