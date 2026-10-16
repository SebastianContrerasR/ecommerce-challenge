import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";

describe("loadConfig", () => {
  it("applies defaults for optional values", () => {
    const config = loadConfig({ DATABASE_URL: "postgresql://localhost:5432/db" });
    expect(config.port).toBe(3000);
    expect(config.host).toBe("0.0.0.0");
    expect(config.databaseUrl).toBe("postgresql://localhost:5432/db");
  });

  it("rejects an invalid port", () => {
    expect(() => loadConfig({ PORT: "not-a-port", DATABASE_URL: "x" })).toThrow();
  });

  it("rejects a missing database url", () => {
    expect(() => loadConfig({})).toThrow();
  });
});
