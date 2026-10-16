import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { getPrismaClient } from "../../src/db/client.js";
import { buildApp } from "../../src/app.js";

const prisma = getPrismaClient();

interface OpenApiDocument {
  paths: Record<
    string,
    Record<
      string,
      {
        summary?: string;
        description?: string;
        responses?: Record<string, unknown>;
      }
    >
  >;
}

describe("openapi documentation", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ prisma, logger: false });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("documents the CSV import endpoint with its summary response shapes", async () => {
    const response = await app.inject({ method: "GET", url: "/openapi.json" });
    expect(response.statusCode).toBe(200);
    const document = response.json() as OpenApiDocument;
    const operation = document.paths["/api/products/import"]?.post;
    expect(operation?.summary).toBe("Import products via CSV upload");
    expect(operation?.description).toContain("multipart/form-data");
    expect(Object.keys(operation?.responses ?? {}).sort()).toEqual([
      "201",
      "400",
      "409",
      "413",
      "422",
    ]);
  });
});
