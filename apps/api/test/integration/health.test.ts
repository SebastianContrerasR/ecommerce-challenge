import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { getPrismaClient } from "../../src/db/client.js";
import { buildApp } from "../../src/app.js";

describe("health endpoints", () => {
  const prisma = getPrismaClient();
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ prisma, logger: false });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("reports liveness without touching the database", async () => {
    const response = await app.inject({ method: "GET", url: "/live" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", service: "api" });
  });

  it("reports readiness when PostgreSQL is reachable", async () => {
    const response = await app.inject({ method: "GET", url: "/ready" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", database: "connected" });
  });

  it("returns a structured envelope for unknown routes", async () => {
    const response = await app.inject({ method: "GET", url: "/does-not-exist" });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: { code: "NOT_FOUND", message: "Route not found: /does-not-exist" },
    });
  });
});
