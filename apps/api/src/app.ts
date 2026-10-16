import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import type { PrismaClient } from "./generated/prisma/client.js";
import { IMPORT_MAX_BYTES } from "@ecommerce/api-contracts";
import { loadConfig } from "./config.js";
import { getPrismaClient } from "./db/client.js";
import { registerErrorHandlers } from "./plugins/errors.js";
import { registerOpenApi } from "./plugins/openapi.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerProductRoutes } from "./modules/products/products.routes.js";
import { registerImportRoutes } from "./modules/import/import.routes.js";
import { registerOrderRoutes } from "./modules/orders/orders.routes.js";
import type { PaymentProvider } from "./modules/payments/paymentProvider.js";
import { FakePaymentProvider } from "./modules/payments/paymentProvider.js";

export interface BuildAppOptions {
  prisma?: PrismaClient;
  logger?: boolean;
  payment?: PaymentProvider;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const prisma = options.prisma ?? getPrismaClient();
  const payment = options.payment ?? new FakePaymentProvider();
  const app = Fastify({
    logger: options.logger ?? true,
    genReqId: () => randomUUID(),
    ajv: { customOptions: { removeAdditional: false } },
  }).withTypeProvider<TypeBoxTypeProvider>();

  app.addHook("onSend", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  await app.register(cors, {
    origin: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
  });
  await app.register(multipart, { limits: { fileSize: IMPORT_MAX_BYTES, files: 1 } });
  await registerOpenApi(app);
  await registerErrorHandlers(app);
  await registerHealthRoutes(app, { prisma });
  await registerProductRoutes(app, { prisma });
  await registerImportRoutes(app, { prisma });
  await registerOrderRoutes(app, { prisma, payment });

  return app;
}

export function getAppConfig() {
  return loadConfig();
}
