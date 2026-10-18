import { describe, expect, it } from "vitest";
import { isUuid } from "./ids.js";

describe("isUuid", () => {
  it("accepts the canonical UUID shape the API issues", () => {
    expect(isUuid("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(isUuid("A1B2C3D4-1234-4ABC-8DEF-0123456789AB")).toBe(true);
  });

  it("rejects path segments that are not UUIDs", () => {
    expect(isUuid("new")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid("11111111-1111-4111-8111")).toBe(false);
    expect(isUuid("11111111111141118111111111111111")).toBe(false);
    expect(isUuid("../../etc/passwd")).toBe(false);
  });
});
