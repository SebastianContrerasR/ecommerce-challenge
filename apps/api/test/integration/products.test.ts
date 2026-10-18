import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";
import { getPrismaClient } from "../../src/db/client.js";
import { buildApp } from "../../src/app.js";
import { getPurchaseBlockReason } from "../../src/modules/products/purchasable.js";

const prisma = getPrismaClient();

interface ProductJson {
  id: string;
  name: string;
  sku: string;
  description: string;
  category: string;
  price: string;
  stock: number;
  weightKg: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

interface ListJson {
  data: ProductJson[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

interface ErrorJson {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

function productPayload(
  sku: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    name: "Running Shoes",
    sku,
    description: "Lightweight running shoes",
    category: "Footwear",
    price: "89.99",
    stock: 150,
    weightKg: "0.350",
    ...overrides,
  };
}

async function createViaApi(
  app: Awaited<ReturnType<typeof buildApp>>,
  sku: string,
  overrides: Record<string, unknown> = {},
): Promise<ProductJson> {
  const response = await app.inject({
    method: "POST",
    url: "/api/products",
    headers: { "content-type": "application/json" },
    payload: productPayload(sku, overrides),
  });
  expect(response.statusCode).toBe(201);
  return response.json() as ProductJson;
}

describe("product catalog", () => {
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

  it("creates and retrieves a product with exact decimal strings", async () => {
    const created = await createViaApi(app, "RS-001");
    expect(created.sku).toBe("RS-001");
    expect(created.price).toBe("89.99");
    expect(created.weightKg).toBe("0.350");
    expect(created.archivedAt).toBe(null);

    const retrieved = await app.inject({ method: "GET", url: `/api/products/${created.id}` });
    expect(retrieved.statusCode).toBe(200);
    expect(retrieved.json()).toEqual(created);
    expect(retrieved.headers["x-request-id"]).toBeDefined();
  });

  it("normalizes SKU by trimming and uppercasing", async () => {
    const created = await createViaApi(app, "  rs-002 ");
    expect(created.sku).toBe("RS-002");

    const listed = await app.inject({ method: "GET", url: "/api/products?q=rs-002" });
    const body = listed.json() as ListJson;
    expect(body.data.map((item) => item.sku)).toEqual(["RS-002"]);
  });

  it("rejects duplicate SKU regardless of case or whitespace", async () => {
    await createViaApi(app, "RS-003");
    const response = await app.inject({
      method: "POST",
      url: "/api/products",
      headers: { "content-type": "application/json" },
      payload: productPayload("  rs-003 "),
    });
    expect(response.statusCode).toBe(409);
    expect((response.json() as ErrorJson).error.code).toBe("SKU_EXISTS");
  });

  it("rejects invalid values and malformed input", async () => {
    const cases: Array<{ overrides: Record<string, unknown>; field: string }> = [
      { overrides: { price: "-1.00" }, field: "price" },
      { overrides: { price: "10.999" }, field: "price" },
      { overrides: { stock: -1 }, field: "stock" },
      { overrides: { name: "" }, field: "name" },
      { overrides: { weightKg: "-0.1" }, field: "weightKg" },
    ];
    for (const testCase of cases) {
      const response = await app.inject({
        method: "POST",
        url: "/api/products",
        headers: { "content-type": "application/json" },
        payload: productPayload(
          `BAD-${testCase.field}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
          testCase.overrides,
        ),
      });
      expect(response.statusCode).toBe(400);
      expect((response.json() as ErrorJson).error.code).toBe("VALIDATION_ERROR");
    }

    const withId = await app.inject({
      method: "POST",
      url: "/api/products",
      headers: { "content-type": "application/json" },
      payload: { ...productPayload("RS-004"), id: "00000000-0000-0000-0000-000000000000" },
    });
    expect(withId.statusCode).toBe(400);
  });

  it("rejects whitespace-only names and categories", async () => {
    for (const overrides of [{ name: "   " }, { category: "  \t " }]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/products",
        headers: { "content-type": "application/json" },
        payload: productPayload(
          `WS-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
          overrides,
        ),
      });
      expect(response.statusCode).toBe(400);
      expect((response.json() as ErrorJson).error.code).toBe("VALIDATION_ERROR");
    }
    expect(await prisma.product.count()).toBe(0);

    const created = await createViaApi(app, "RS-WS-1");
    const patched = await app.inject({
      method: "PATCH",
      url: `/api/products/${created.id}`,
      headers: { "content-type": "application/json" },
      payload: { name: "  " },
    });
    expect(patched.statusCode).toBe(400);
    expect((patched.json() as ErrorJson).error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 for nonexistent products and 400 for malformed ids", async () => {
    const missing = await app.inject({
      method: "GET",
      url: "/api/products/00000000-0000-0000-0000-000000000000",
    });
    expect(missing.statusCode).toBe(404);
    expect((missing.json() as ErrorJson).error.code).toBe("PRODUCT_NOT_FOUND");

    const malformed = await app.inject({ method: "GET", url: "/api/products/not-a-uuid" });
    expect(malformed.statusCode).toBe(400);
    expect((malformed.json() as ErrorJson).error.code).toBe("VALIDATION_ERROR");
  });

  it("updates products and enforces SKU uniqueness on update", async () => {
    const first = await createViaApi(app, "RS-010");
    await createViaApi(app, "RS-011");

    const updated = await app.inject({
      method: "PATCH",
      url: `/api/products/${first.id}`,
      headers: { "content-type": "application/json" },
      payload: { name: "Trail Shoes", price: "99.50" },
    });
    expect(updated.statusCode).toBe(200);
    expect((updated.json() as ProductJson).name).toBe("Trail Shoes");
    expect((updated.json() as ProductJson).price).toBe("99.50");

    const renamed = await app.inject({
      method: "PATCH",
      url: `/api/products/${first.id}`,
      headers: { "content-type": "application/json" },
      payload: { sku: " rs-012 " },
    });
    expect(renamed.statusCode).toBe(200);
    expect((renamed.json() as ProductJson).sku).toBe("RS-012");

    const conflict = await app.inject({
      method: "PATCH",
      url: `/api/products/${first.id}`,
      headers: { "content-type": "application/json" },
      payload: { sku: "rs-011" },
    });
    expect(conflict.statusCode).toBe(409);
    expect((conflict.json() as ErrorJson).error.code).toBe("SKU_EXISTS");
  });

  it("archives on delete and blocks further modification", async () => {
    const created = await createViaApi(app, "RS-020");

    const archived = await app.inject({ method: "DELETE", url: `/api/products/${created.id}` });
    expect(archived.statusCode).toBe(200);
    const archivedBody = archived.json() as ProductJson;
    expect(archivedBody.archivedAt).not.toBe(null);

    const secondDelete = await app.inject({
      method: "DELETE",
      url: `/api/products/${created.id}`,
    });
    expect(secondDelete.statusCode).toBe(409);
    expect((secondDelete.json() as ErrorJson).error.code).toBe("PRODUCT_ARCHIVED");

    const patchArchived = await app.inject({
      method: "PATCH",
      url: `/api/products/${created.id}`,
      headers: { "content-type": "application/json" },
      payload: { name: "Changed" },
    });
    expect(patchArchived.statusCode).toBe(409);

    expect(getPurchaseBlockReason({ archivedAt: archivedBody.archivedAt })).toBe(
      "PRODUCT_ARCHIVED",
    );
  });

  it("searches case-insensitively across name, sku, description, and category", async () => {
    await createViaApi(app, "RS-030", {
      name: "Trail Runner",
      description: "Mountain shoe",
      category: "Footwear",
    });
    await createViaApi(app, "CAP-001", {
      name: "Baseball Cap",
      description: "Cotton cap",
      category: "Apparel",
    });

    for (const term of ["trail", "TRAIL", "rs-030", "mountain", "FOOTWEAR"]) {
      const response = await app.inject({
        method: "GET",
        url: `/api/products?q=${encodeURIComponent(term)}`,
      });
      const body = response.json() as ListJson;
      expect(body.data.length).toBe(1);
      expect(body.data[0]?.sku).toBe("RS-030");
    }

    const categoryResponse = await app.inject({
      method: "GET",
      url: "/api/products?category=apparel",
    });
    const categoryBody = categoryResponse.json() as ListJson;
    expect(categoryBody.data.map((item) => item.sku)).toEqual(["CAP-001"]);
  });

  it("excludes archived products from ordinary search", async () => {
    const visible = await createViaApi(app, "RS-040");
    const hidden = await createViaApi(app, "RS-041");
    await app.inject({ method: "DELETE", url: `/api/products/${hidden.id}` });

    const standard = (await app.inject({ method: "GET", url: "/api/products" })).json() as ListJson;
    expect(standard.data.map((item) => item.sku)).toEqual(["RS-040"]);
    expect(visible.id).toBeDefined();

    const withArchived = (
      await app.inject({
        method: "GET",
        url: "/api/products?includeArchived=true",
      })
    ).json() as ListJson;
    expect(withArchived.data.map((item) => item.sku).sort()).toEqual(["RS-040", "RS-041"]);
  });

  it("hides out-of-stock products only when inStock is requested", async () => {
    const stocked = await createViaApi(app, "ST-001");
    const depleted = await createViaApi(app, "ST-002", { stock: 0 });

    const unfiltered = (
      await app.inject({ method: "GET", url: "/api/products" })
    ).json() as ListJson;
    expect(unfiltered.data.map((item) => item.sku).sort()).toEqual(["ST-001", "ST-002"]);
    expect(unfiltered.pagination.totalItems).toBe(2);

    const inStock = (
      await app.inject({ method: "GET", url: "/api/products?inStock=true" })
    ).json() as ListJson;
    expect(inStock.data.map((item) => item.sku)).toEqual([stocked.sku]);
    expect(inStock.pagination.totalItems).toBe(1);

    const explicitFalse = (
      await app.inject({ method: "GET", url: "/api/products?inStock=false" })
    ).json() as ListJson;
    expect(explicitFalse.pagination.totalItems).toBe(2);

    const combined = (
      await app.inject({
        method: "GET",
        url: "/api/products?inStock=true&includeArchived=true",
      })
    ).json() as ListJson;
    expect(combined.data.map((item) => item.sku)).toEqual([stocked.sku]);

    await app.inject({ method: "DELETE", url: `/api/products/${stocked.id}` });
    const onlyArchivedLeft = (
      await app.inject({ method: "GET", url: "/api/products?inStock=true" })
    ).json() as ListJson;
    expect(onlyArchivedLeft.data).toEqual([]);
    expect(depleted.stock).toBe(0);
  });

  it("rejects an invalid inStock flag", async () => {
    const response = await app.inject({ method: "GET", url: "/api/products?inStock=maybe" });
    expect(response.statusCode).toBe(400);
    expect((response.json() as ErrorJson).error.code).toBe("INVALID_QUERY");
  });

  it("paginates with boundaries and rejects invalid sort parameters", async () => {
    for (let index = 1; index <= 25; index += 1) {
      const sku = `PG-${String(index).padStart(3, "0")}`;
      await createViaApi(app, sku, { name: `Product ${String(index).padStart(3, "0")}` });
    }

    const firstPage = (
      await app.inject({
        method: "GET",
        url: "/api/products?pageSize=20&page=1&sort=name&order=asc",
      })
    ).json() as ListJson;
    expect(firstPage.data.length).toBe(20);
    expect(firstPage.pagination).toEqual({ page: 1, pageSize: 20, totalItems: 25, totalPages: 2 });

    const secondPage = (
      await app.inject({
        method: "GET",
        url: "/api/products?pageSize=20&page=2&sort=name&order=asc",
      })
    ).json() as ListJson;
    expect(secondPage.data.length).toBe(5);

    const beyond = (
      await app.inject({ method: "GET", url: "/api/products?pageSize=20&page=3" })
    ).json() as ListJson;
    expect(beyond.data).toEqual([]);

    const tooLarge = await app.inject({ method: "GET", url: "/api/products?pageSize=101" });
    expect(tooLarge.statusCode).toBe(400);
    expect((tooLarge.json() as ErrorJson).error.code).toBe("INVALID_PAGINATION");

    const badPage = await app.inject({ method: "GET", url: "/api/products?page=0" });
    expect(badPage.statusCode).toBe(400);

    const badSort = await app.inject({ method: "GET", url: "/api/products?sort=color" });
    expect(badSort.statusCode).toBe(400);
    expect((badSort.json() as ErrorJson).error.code).toBe("INVALID_SORT");
  });

  it("enforces database constraints independently of application validation", async () => {
    await expect(
      prisma.product.create({
        data: {
          name: "Raw",
          sku: "RAW-001",
          description: "",
          category: "Test",
          price: "-5.00",
          stock: 1,
          weightKg: "1.000",
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.product.create({
        data: {
          name: "Raw",
          sku: "RAW-002",
          description: "",
          category: "Test",
          price: "5.00",
          stock: -1,
          weightKg: "1.000",
        },
      }),
    ).rejects.toThrow();

    await prisma.product.create({
      data: {
        name: "Raw",
        sku: "RAW-003",
        description: "",
        category: "Test",
        price: "5.00",
        stock: 1,
        weightKg: "1.000",
      },
    });
    await expect(
      prisma.product.create({
        data: {
          name: "Raw duplicate",
          sku: "RAW-003",
          description: "",
          category: "Test",
          price: "6.00",
          stock: 1,
          weightKg: "1.000",
        },
      }),
    ).rejects.toThrow();
  });
});
