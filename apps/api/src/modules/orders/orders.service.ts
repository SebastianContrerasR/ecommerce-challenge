import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { getPurchaseBlockReason } from "../products/purchasable.js";
import { productArchived, productNotFound } from "../products/products.errors.js";
import type { PaymentProvider } from "../payments/paymentProvider.js";
import { buildErrorEnvelope } from "../../utils/errorEnvelope.js";
import type { ErrorEnvelope } from "../../utils/errorEnvelope.js";
import { hashOrderRequest, normalizeOrderItems } from "./normalize.js";
import type { OrderLineInput } from "./normalize.js";
import { calculateOrderLines } from "./totals.js";
import { toOrderResponse } from "./mapper.js";
import type { OrderResponse } from "./mapper.js";
import {
  OrderServiceError,
  idempotencyKeyConflict,
  insufficientStock,
  orderNotFound,
} from "./orders.errors.js";

export interface CreateOrderInput {
  items: OrderLineInput[];
  idempotencyKey: string;
}

export type CreateOrderResult =
  | { status: 201; body: OrderResponse }
  | { status: 402; body: ErrorEnvelope };

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  return (error as { code?: unknown }).code === "P2002";
}

function toStoredJson(body: OrderResponse | ErrorEnvelope): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(body)) as Prisma.InputJsonValue;
}

async function resolveIdempotencyRace(
  prisma: PrismaClient,
  key: string,
  requestHash: string,
): Promise<CreateOrderResult> {
  const existing = await prisma.idempotencyKey.findUnique({ where: { key } });
  if (existing === null) {
    throw new Error(`Idempotency record vanished for key: ${key}`);
  }
  if (existing.requestHash !== requestHash) {
    throw idempotencyKeyConflict();
  }
  if (existing.responseStatus === 201) {
    return { status: 201, body: existing.responseBody as unknown as OrderResponse };
  }
  return { status: 402, body: existing.responseBody as unknown as ErrorEnvelope };
}

async function replayIfStored(
  prisma: PrismaClient,
  key: string,
  requestHash: string,
): Promise<CreateOrderResult | null> {
  const existing = await prisma.idempotencyKey.findUnique({ where: { key } });
  if (existing === null) {
    return null;
  }
  if (existing.requestHash !== requestHash) {
    throw idempotencyKeyConflict();
  }
  if (existing.responseStatus === 201) {
    return { status: 201, body: existing.responseBody as unknown as OrderResponse };
  }
  return { status: 402, body: existing.responseBody as unknown as ErrorEnvelope };
}

export async function createOrder(
  prisma: PrismaClient,
  payment: PaymentProvider,
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  const items = normalizeOrderItems(input.items);
  const requestHash = hashOrderRequest(items);
  const replayed = await replayIfStored(prisma, input.idempotencyKey, requestHash);
  if (replayed !== null) {
    return replayed;
  }

  const products = await prisma.product.findMany({
    where: { id: { in: items.map((item) => item.productId) } },
  });
  const productsById = new Map(products.map((product) => [product.id, product]));
  for (const item of items) {
    const product = productsById.get(item.productId);
    if (product === undefined) {
      throw productNotFound(item.productId);
    }
    if (getPurchaseBlockReason(product) !== null) {
      throw productArchived(item.productId);
    }
  }

  const unitPriceByProductId = new Map(
    products.map((product) => [product.id, product.price.toFixed(2)] as const),
  );
  const { lines, total } = calculateOrderLines(items, unitPriceByProductId);
  const productsByIdForSnapshot = productsById;

  const charge = await payment.charge({ amount: total, idempotencyKey: input.idempotencyKey });
  if (charge.outcome === "declined") {
    const body = buildErrorEnvelope("PAYMENT_DECLINED", charge.reason, {
      total,
    });
    try {
      await prisma.idempotencyKey.create({
        data: {
          key: input.idempotencyKey,
          requestHash,
          responseStatus: 402,
          responseBody: toStoredJson(body),
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return resolveIdempotencyRace(prisma, input.idempotencyKey, requestHash);
      }
      throw error;
    }
    return { status: 402, body };
  }

  const reference = charge.reference;
  try {
    const body = await prisma.$transaction(async (tx) => {
      for (const line of lines) {
        const decremented = await tx.$executeRaw`
          UPDATE "products"
          SET "stock" = "stock" - ${line.quantity}, "updated_at" = CURRENT_TIMESTAMP
          WHERE "id" = ${line.productId}::uuid AND "stock" >= ${line.quantity}`;
        if (decremented !== 1) {
          throw insufficientStock(line.productId);
        }
      }
      const created = await tx.order.create({
        data: {
          status: "PAID",
          paymentStatus: "SUCCEEDED",
          paymentReference: reference,
          total,
          items: {
            create: lines.map((line) => {
              const product = productsByIdForSnapshot.get(line.productId);
              if (product === undefined) {
                throw productNotFound(line.productId);
              }
              return {
                productId: line.productId,
                productSku: product.sku,
                productName: product.name,
                unitPrice: line.unitPrice,
                quantity: line.quantity,
                lineTotal: line.lineTotal,
              };
            }),
          },
        },
        include: { items: true },
      });
      const responseBody = toOrderResponse(created);
      await tx.idempotencyKey.create({
        data: {
          key: input.idempotencyKey,
          requestHash,
          responseStatus: 201,
          responseBody: toStoredJson(responseBody),
        },
      });
      return responseBody;
    });
    return { status: 201, body };
  } catch (error) {
    if (error instanceof OrderServiceError && error.code === "INSUFFICIENT_STOCK") {
      await payment.void(reference);
      throw error;
    }
    if (isUniqueViolation(error)) {
      await payment.void(reference);
      return resolveIdempotencyRace(prisma, input.idempotencyKey, requestHash);
    }
    await payment.void(reference).catch(() => undefined);
    throw error;
  }
}

export async function getOrderById(prisma: PrismaClient, id: string): Promise<OrderResponse> {
  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: true },
  });
  if (order === null) {
    throw orderNotFound(id);
  }
  return toOrderResponse(order);
}
