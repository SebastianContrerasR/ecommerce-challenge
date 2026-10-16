import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";
import { getPrismaClient } from "../../src/db/client.js";
import { buildApp } from "../../src/app.js";
import { FakePaymentProvider } from "../../src/modules/payments/paymentProvider.js";

const prisma = getPrismaClient();

interface OrderItemJson {
  productId: string;
  productName: string;
  productSku: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
}

interface OrderJson {
  id: string;
  status: string;
  paymentStatus: string;
  paymentReference: string;
  total: string;
  items: OrderItemJson[];
  createdAt: string;
}

interface ErrorJson {
  error: { code: string; message: string };
}

async function createProduct(sku: string, overrides: Record<string, unknown> = {}) {
  return prisma.product.create({
    data: {
      name: `Product ${sku}`,
      sku,
      description: "",
      category: "Test",
      price: "19.99",
      stock: 10,
      weightKg: "0.500",
      ...overrides,
    },
  });
}

describe("order processing", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let payment: FakePaymentProvider;

  beforeAll(async () => {
    payment = new FakePaymentProvider();
    app = await buildApp({ prisma, logger: false, payment });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.order.deleteMany();
    await prisma.idempotencyKey.deleteMany();
    await prisma.product.deleteMany();
    payment.charges.length = 0;
    payment.voids.length = 0;
  });

  async function postOrder(items: Array<{ productId: string; quantity: number }>, key?: string) {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (key !== undefined) {
      headers["idempotency-key"] = key;
    }
    return app.inject({
      method: "POST",
      url: "/api/orders",
      headers,
      payload: { items },
    });
  }

  it("creates an order with server-side totals, snapshots, and decremented stock", async () => {
    const first = await createProduct("O-001", { price: "19.99", stock: 10 });
    const second = await createProduct("O-002", { price: "0.10", stock: 10, name: "Second" });
    const response = await postOrder(
      [
        { productId: first.id, quantity: 2 },
        { productId: second.id, quantity: 3 },
      ],
      "order-key-1",
    );
    expect(response.statusCode).toBe(201);
    const order = response.json() as OrderJson;
    expect(order.status).toBe("PAID");
    expect(order.paymentStatus).toBe("SUCCEEDED");
    expect(order.paymentReference).toMatch(/^fake_pay_/);
    expect(order.total).toBe("40.28");
    expect(order.items).toHaveLength(2);
    const firstLine = order.items.find((item) => item.productSku === "O-001");
    expect(firstLine).toMatchObject({
      productName: "Product O-001",
      unitPrice: "19.99",
      quantity: 2,
      lineTotal: "39.98",
    });
    expect(response.headers["x-request-id"]).toBeDefined();

    const stored = await prisma.order.findUnique({
      where: { id: order.id },
      include: { items: true },
    });
    expect(stored?.total.toFixed(2)).toBe("40.28");
    expect(await prisma.product.findUnique({ where: { id: first.id } }).then((p) => p?.stock)).toBe(
      8,
    );
    expect(
      await prisma.product.findUnique({ where: { id: second.id } }).then((p) => p?.stock),
    ).toBe(7);

    const fetched = await app.inject({ method: "GET", url: `/api/orders/${order.id}` });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json()).toEqual(order);
  });

  it("merges duplicate lines for the same product", async () => {
    const product = await createProduct("O-010", { price: "5.00", stock: 10 });
    const response = await postOrder(
      [
        { productId: product.id, quantity: 1 },
        { productId: product.id, quantity: 2 },
      ],
      "order-key-merge",
    );
    expect(response.statusCode).toBe(201);
    const order = response.json() as OrderJson;
    expect(order.items).toHaveLength(1);
    expect(order.items[0]).toMatchObject({ quantity: 3, lineTotal: "15.00" });
    expect(order.total).toBe("15.00");
  });

  it("rejects invalid quantities and missing keys without charging", async () => {
    const product = await createProduct("O-020");
    const chargesBefore = payment.charges.length;
    for (const items of [
      [{ productId: product.id, quantity: 0 }],
      [{ productId: product.id, quantity: -1 }],
      [{ productId: product.id, quantity: 1.5 }],
    ]) {
      const response = await postOrder(items, `bad-qty-${chargesBefore}`);
      expect(response.statusCode).toBe(400);
    }
    const missingKey = await postOrder([{ productId: product.id, quantity: 1 }]);
    expect(missingKey.statusCode).toBe(400);
    expect(payment.charges.length).toBe(chargesBefore);
    expect(await prisma.order.count()).toBe(0);
  });

  it("rejects quantities above the 32-bit stock range with a 400 instead of failing internally", async () => {
    const product = await createProduct("O-021", { stock: 10 });
    const chargesBefore = payment.charges.length;
    const response = await postOrder(
      [{ productId: product.id, quantity: 9999999999 }],
      "order-key-huge-qty",
    );
    expect(response.statusCode).toBe(400);
    expect((response.json() as ErrorJson).error.code).toBe("VALIDATION_ERROR");
    expect(payment.charges.length).toBe(chargesBefore);
    expect(await prisma.order.count()).toBe(0);
    expect(
      await prisma.product.findUnique({ where: { id: product.id } }).then((p) => p?.stock),
    ).toBe(10);
  });

  it("rejects missing and archived products", async () => {
    const missing = await postOrder(
      [{ productId: "00000000-0000-0000-0000-000000000000", quantity: 1 }],
      "order-key-missing",
    );
    expect(missing.statusCode).toBe(404);
    expect((missing.json() as ErrorJson).error.code).toBe("PRODUCT_NOT_FOUND");

    const product = await createProduct("O-030");
    await app.inject({ method: "DELETE", url: `/api/products/${product.id}` });
    const archived = await postOrder(
      [{ productId: product.id, quantity: 1 }],
      "order-key-archived",
    );
    expect(archived.statusCode).toBe(409);
    expect((archived.json() as ErrorJson).error.code).toBe("PRODUCT_ARCHIVED");
    expect(payment.charges.length).toBe(0);
  });

  it("fails the whole purchase on insufficient stock without side effects", async () => {
    const product = await createProduct("O-040", { stock: 2 });
    const response = await postOrder([{ productId: product.id, quantity: 3 }], "order-key-stock");
    expect(response.statusCode).toBe(409);
    expect((response.json() as ErrorJson).error.code).toBe("INSUFFICIENT_STOCK");
    expect(
      await prisma.product.findUnique({ where: { id: product.id } }).then((p) => p?.stock),
    ).toBe(2);
    expect(await prisma.order.count()).toBe(0);
    expect(payment.voids).toHaveLength(1);
  });

  it("rolls back multi-product orders atomically", async () => {
    const plenty = await createProduct("O-050", { stock: 5 });
    const scarce = await createProduct("O-051", { stock: 1 });
    const response = await postOrder(
      [
        { productId: plenty.id, quantity: 2 },
        { productId: scarce.id, quantity: 5 },
      ],
      "order-key-atomic",
    );
    expect(response.statusCode).toBe(409);
    expect(
      await prisma.product.findUnique({ where: { id: plenty.id } }).then((p) => p?.stock),
    ).toBe(5);
    expect(
      await prisma.product.findUnique({ where: { id: scarce.id } }).then((p) => p?.stock),
    ).toBe(1);
    expect(await prisma.order.count()).toBe(0);
  });

  it("replays the same key with the same request without duplicating", async () => {
    const product = await createProduct("O-060", { price: "7.50", stock: 10 });
    const payload = [{ productId: product.id, quantity: 2 }];
    const first = await postOrder(payload, "order-key-replay");
    const second = await postOrder(payload, "order-key-replay");
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json()).toEqual(first.json());
    expect(await prisma.order.count()).toBe(1);
    expect(payment.charges).toHaveLength(1);
  });

  it("rejects reuse of a key with a different payload", async () => {
    const product = await createProduct("O-070", { stock: 10 });
    const first = await postOrder([{ productId: product.id, quantity: 1 }], "order-key-conflict");
    expect(first.statusCode).toBe(201);
    const second = await postOrder([{ productId: product.id, quantity: 2 }], "order-key-conflict");
    expect(second.statusCode).toBe(409);
    expect((second.json() as ErrorJson).error.code).toBe("IDEMPOTENCY_KEY_CONFLICT");
    expect(await prisma.order.count()).toBe(1);
  });

  it("allows retry with the same key after restocking a failed attempt", async () => {
    const product = await createProduct("O-080", { stock: 0 });
    const failed = await postOrder([{ productId: product.id, quantity: 1 }], "order-key-retry");
    expect(failed.statusCode).toBe(409);
    await prisma.product.update({ where: { id: product.id }, data: { stock: 5 } });
    const retried = await postOrder([{ productId: product.id, quantity: 1 }], "order-key-retry");
    expect(retried.statusCode).toBe(201);
    expect(await prisma.order.count()).toBe(1);
  });

  it("returns stored orders and 404 for unknown ids", async () => {
    const product = await createProduct("O-090", { stock: 5 });
    const created = (
      await postOrder([{ productId: product.id, quantity: 1 }], "order-key-get")
    ).json() as OrderJson;
    const fetched = await app.inject({ method: "GET", url: `/api/orders/${created.id}` });
    expect(fetched.statusCode).toBe(200);
    const missing = await app.inject({
      method: "GET",
      url: "/api/orders/00000000-0000-0000-0000-000000000000",
    });
    expect(missing.statusCode).toBe(404);
    expect((missing.json() as ErrorJson).error.code).toBe("ORDER_NOT_FOUND");
    const malformed = await app.inject({ method: "GET", url: "/api/orders/not-a-uuid" });
    expect(malformed.statusCode).toBe(400);
  });

  it("lets exactly one of two concurrent purchases win the last unit", async () => {
    const product = await createProduct("O-100", { stock: 1 });
    const [first, second] = await Promise.all([
      postOrder([{ productId: product.id, quantity: 1 }], "order-key-race-a"),
      postOrder([{ productId: product.id, quantity: 1 }], "order-key-race-b"),
    ]);
    const statuses = [first.statusCode, second.statusCode].sort();
    expect(statuses).toEqual([201, 409]);
    const loser = first.statusCode === 409 ? first : second;
    expect((loser.json() as ErrorJson).error.code).toBe("INSUFFICIENT_STOCK");
    expect(await prisma.order.count()).toBe(1);
    const remaining = await prisma.product
      .findUnique({ where: { id: product.id } })
      .then((p) => p?.stock);
    expect(remaining).toBe(0);
  });

  it("creates no duplicate orders for concurrent requests sharing a key", async () => {
    const product = await createProduct("O-110", { stock: 5 });
    const payload = [{ productId: product.id, quantity: 1 }];
    const [first, second] = await Promise.all([
      postOrder(payload, "order-key-shared"),
      postOrder(payload, "order-key-shared"),
    ]);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json()).toEqual(first.json());
    expect(await prisma.order.count()).toBe(1);
    expect(
      await prisma.product.findUnique({ where: { id: product.id } }).then((p) => p?.stock),
    ).toBe(4);
  });

  it("enforces the atomic stock guard at the database level", async () => {
    const product = await createProduct("O-120", { stock: 1 });
    const decremented = await prisma.$executeRaw`
      UPDATE "products" SET "stock" = "stock" - 5
      WHERE "id" = ${product.id}::uuid AND "stock" >= 5`;
    expect(decremented).toBe(0);
    expect(
      await prisma.product.findUnique({ where: { id: product.id } }).then((p) => p?.stock),
    ).toBe(1);
  });

  it("records payment decline without creating an order and replays it", async () => {
    const declining = new FakePaymentProvider("decline");
    const decliningApp = await buildApp({ prisma, logger: false, payment: declining });
    try {
      const product = await createProduct("O-130", { stock: 5 });
      const first = await decliningApp.inject({
        method: "POST",
        url: "/api/orders",
        headers: { "content-type": "application/json", "idempotency-key": "order-key-decline" },
        payload: { items: [{ productId: product.id, quantity: 1 }] },
      });
      expect(first.statusCode).toBe(402);
      expect((first.json() as ErrorJson).error.code).toBe("PAYMENT_DECLINED");
      const second = await decliningApp.inject({
        method: "POST",
        url: "/api/orders",
        headers: { "content-type": "application/json", "idempotency-key": "order-key-decline" },
        payload: { items: [{ productId: product.id, quantity: 1 }] },
      });
      expect(second.statusCode).toBe(402);
      expect(second.json()).toEqual(first.json());
      expect(await prisma.order.count()).toBe(0);
      expect(
        await prisma.product.findUnique({ where: { id: product.id } }).then((p) => p?.stock),
      ).toBe(5);
    } finally {
      await decliningApp.close();
    }
  });
});
