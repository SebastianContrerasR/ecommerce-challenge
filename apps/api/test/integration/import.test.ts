import { readFileSync } from "node:fs";
import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";
import { IMPORT_MAX_ERROR_DETAILS } from "@ecommerce/api-contracts";
import { getPrismaClient } from "../../src/db/client.js";
import { buildApp } from "../../src/app.js";
import { persistImportRows } from "../../src/modules/import/import.service.js";
import { ImportServiceError } from "../../src/modules/import/import.errors.js";

const prisma = getPrismaClient();

interface ImportSummaryJson {
  totalRecords: number;
  validRecords: number;
  errorCount: number;
  created: number;
  errors: Array<{ record: number; field: string; code: string; message: string }>;
}

interface ErrorJson {
  error: { code: string; message: string };
}

interface ListJson {
  data: Array<{ sku: string; name: string; price: string }>;
  pagination: { totalItems: number };
}

const BOUNDARY = "----importtestboundary";

function fixture(name: string): Buffer {
  return readFileSync(new URL(`../fixtures/csv/${name}`, import.meta.url));
}

async function uploadCsv(
  app: Awaited<ReturnType<typeof buildApp>>,
  filename: string,
  content: Buffer,
  field = "file",
) {
  const header = Buffer.from(
    `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: text/csv\r\n\r\n`,
  );
  const footer = Buffer.from(`\r\n--${BOUNDARY}--\r\n`);
  return app.inject({
    method: "POST",
    url: "/api/products/import",
    headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
    payload: Buffer.concat([header, content, footer]),
  });
}

describe("product csv import", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ prisma, logger: false });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.order.deleteMany();
    await prisma.idempotencyKey.deleteMany();
    await prisma.product.deleteMany();
  });

  it("imports multiple valid products with exact decimals", async () => {
    const response = await uploadCsv(app, "valid-three.csv", fixture("valid-three.csv"));
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      totalRecords: 3,
      validRecords: 3,
      errorCount: 0,
      created: 3,
      errors: [],
    });

    const listed = (
      await app.inject({ method: "GET", url: "/api/products?pageSize=10" })
    ).json() as ListJson;
    expect(listed.pagination.totalItems).toBe(3);
    const prices = new Map(listed.data.map((item) => [item.sku, item.price]));
    expect(prices.get("TR-101")).toBe("129.99");
    expect(response.headers["x-request-id"]).toBeDefined();
  });

  it("imports the challenge example record with exact values", async () => {
    const response = await uploadCsv(
      app,
      "challenge-example.csv",
      fixture("challenge-example.csv"),
    );
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      totalRecords: 1,
      validRecords: 1,
      errorCount: 0,
      created: 1,
      errors: [],
    });

    const listed = (
      await app.inject({ method: "GET", url: "/api/products?q=RS-001" })
    ).json() as ListJson;
    expect(listed.pagination.totalItems).toBe(1);
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0]).toMatchObject({
      name: "Running Shoes",
      sku: "RS-001",
      description: "Lightweight running shoes for daily training",
      category: "Footwear",
      price: "89.99",
      stock: 150,
      weightKg: "0.350",
    });
  });

  it("rejects the supplied example file without persisting anything", async () => {
    const content = readFileSync(new URL("../../../../docs/example.csv", import.meta.url));
    const response = await uploadCsv(app, "example.csv", content);
    expect(response.statusCode).toBe(422);
    const summary = response.json() as ImportSummaryJson;
    expect(summary.totalRecords).toBe(95);
    expect(summary.created).toBe(0);
    expect(summary.errorCount).toBe(10);
    expect(new Set(summary.errors.map((error) => error.code))).toEqual(
      new Set(["INVALID_PRICE", "INVALID_STOCK", "REQUIRED", "DUPLICATE_SKU_IN_FILE"]),
    );
    expect(await prisma.product.count()).toBe(0);
  });

  it("rejects SKUs already stored without creating the valid rows", async () => {
    await app.inject({
      method: "POST",
      url: "/api/products",
      headers: { "content-type": "application/json" },
      payload: {
        name: "Existing",
        sku: "DB-001",
        description: "",
        category: "Electronics",
        price: "10.00",
        stock: 1,
        weightKg: "0.100",
      },
    });
    const response = await uploadCsv(app, "db-duplicate.csv", fixture("db-duplicate.csv"));
    expect(response.statusCode).toBe(422);
    const summary = response.json() as ImportSummaryJson;
    expect(summary.created).toBe(0);
    expect(summary.errors).toMatchObject([{ record: 1, field: "sku", code: "SKU_EXISTS" }]);
    expect(await prisma.product.count()).toBe(1);
  });

  it("accepts header-only files with zero created and rejects empty files", async () => {
    const headerOnly = await uploadCsv(app, "header-only.csv", fixture("header-only.csv"));
    expect(headerOnly.statusCode).toBe(201);
    expect(headerOnly.json()).toMatchObject({ totalRecords: 0, created: 0, errorCount: 0 });

    const empty = await uploadCsv(app, "empty.csv", Buffer.alloc(0));
    expect(empty.statusCode).toBe(422);
    expect((empty.json() as ImportSummaryJson).errors[0]).toMatchObject({ code: "EMPTY_FILE" });
  });

  it("requires the documented file field", async () => {
    const wrongField = await uploadCsv(
      app,
      "valid-three.csv",
      fixture("valid-three.csv"),
      "upload",
    );
    expect(wrongField.statusCode).toBe(400);
    expect((wrongField.json() as ErrorJson).error.code).toBe("IMPORT_MISSING_FILE");
  });

  it("rejects oversized uploads with a clear failure", async () => {
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1, 97);
    const response = await uploadCsv(app, "big.csv", oversized);
    expect(response.statusCode).toBe(413);
    expect((response.json() as ErrorJson).error.code).toBe("FILE_TOO_LARGE");
    expect(await prisma.product.count()).toBe(0);
  });

  it("stores special names verbatim without affecting the table", async () => {
    const response = await uploadCsv(app, "special-names.csv", fixture("special-names.csv"));
    expect(response.statusCode).toBe(201);
    const listed = (
      await app.inject({ method: "GET", url: "/api/products?pageSize=10" })
    ).json() as ListJson;
    const names = new Map(listed.data.map((item) => [item.sku, item.name]));
    expect(names.get("XS-901")).toBe("<script>alert('xss')</script>");
    expect(names.get("SQ-902")).toBe("Robert'); DROP TABLE products;--");
    expect(listed.pagination.totalItems).toBe(2);
  });

  it("caps detailed errors while reporting the true error count", async () => {
    const lines = ["name,sku,description,category,price,stock,weight_kg"];
    for (let index = 1; index <= IMPORT_MAX_ERROR_DETAILS + 50; index += 1) {
      lines.push(`,CAP-${index},Missing name,Category,10.00,5,0.200`);
    }
    const response = await uploadCsv(app, "many-errors.csv", Buffer.from(lines.join("\n"), "utf8"));
    expect(response.statusCode).toBe(422);
    const summary = response.json() as ImportSummaryJson;
    expect(summary.errorCount).toBe(IMPORT_MAX_ERROR_DETAILS + 50);
    expect(summary.errors.length).toBe(IMPORT_MAX_ERROR_DETAILS);
    expect(summary.created).toBe(0);
    expect(await prisma.product.count()).toBe(0);
  });

  it("rolls back every row when persistence fails on a conflict", async () => {
    await prisma.product.create({
      data: {
        name: "Existing",
        sku: "CF-001",
        description: "",
        category: "Electronics",
        price: "10.00",
        stock: 1,
        weightKg: "0.100",
      },
    });
    try {
      await persistImportRows(prisma, [
        {
          record: 1,
          name: "Fresh",
          sku: "CF-002",
          description: "",
          category: "Electronics",
          price: "11.00",
          stock: 2,
          weightKg: "0.200",
        },
        {
          record: 2,
          name: "Conflicting",
          sku: "CF-001",
          description: "",
          category: "Electronics",
          price: "12.00",
          stock: 3,
          weightKg: "0.300",
        },
      ]);
    } catch (error) {
      expect(error).toBeInstanceOf(ImportServiceError);
      expect((error as ImportServiceError).code).toBe("IMPORT_CONFLICT");
      expect(await prisma.product.count()).toBe(1);
      expect(await prisma.product.findUnique({ where: { sku: "CF-002" } })).toBe(null);
      return;
    }
    throw new Error("Expected IMPORT_CONFLICT");
  });
});
