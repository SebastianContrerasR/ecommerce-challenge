import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { getPrismaClient } from "../../src/db/client.js";
import { buildApp } from "../../src/app.js";

describe("browser CORS preflight", () => {
  const prisma = getPrismaClient();
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ prisma, logger: false });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it.each(["PATCH", "DELETE", "POST"])("allows %s from browser origins", async (method) => {
    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/products",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": method,
      },
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-methods"] ?? "").toContain(method);
  });
});
