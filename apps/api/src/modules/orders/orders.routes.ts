import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import type { PrismaClient } from "../../generated/prisma/client.js";
import {
  CreateOrderSchema,
  ErrorEnvelopeSchema,
  IdempotencyKeyHeadersSchema,
  OrderParamsSchema,
  OrderSchema,
} from "@ecommerce/api-contracts";
import type { PaymentProvider } from "../payments/paymentProvider.js";
import { createOrder, getOrderById } from "./orders.service.js";

export interface OrderRouteOptions {
  prisma: PrismaClient;
  payment: PaymentProvider;
}

export async function registerOrderRoutes(
  app: FastifyInstance,
  options: OrderRouteOptions,
): Promise<void> {
  const orders = app.withTypeProvider<TypeBoxTypeProvider>();
  const prisma = options.prisma;
  const payment = options.payment;

  orders.post(
    "/api/orders",
    {
      schema: {
        headers: IdempotencyKeyHeadersSchema,
        body: CreateOrderSchema,
        response: {
          201: OrderSchema,
          400: ErrorEnvelopeSchema,
          402: ErrorEnvelopeSchema,
          404: ErrorEnvelopeSchema,
          409: ErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await createOrder(prisma, payment, {
        items: request.body.items,
        idempotencyKey: request.headers["idempotency-key"],
      });
      await reply.status(result.status).send(result.body);
    },
  );

  orders.get(
    "/api/orders/:id",
    {
      schema: {
        params: OrderParamsSchema,
        response: {
          200: OrderSchema,
          400: ErrorEnvelopeSchema,
          404: ErrorEnvelopeSchema,
        },
      },
    },
    async (request) => {
      return getOrderById(prisma, request.params.id);
    },
  );
}
