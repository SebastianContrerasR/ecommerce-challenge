import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../generated/prisma/client.js";
import {
  LiveResponseSchema,
  ReadyResponseSchema,
  NotReadyResponseSchema,
} from "@ecommerce/api-contracts";

export interface HealthRouteOptions {
  prisma: PrismaClient;
}

export async function registerHealthRoutes(
  app: FastifyInstance,
  options: HealthRouteOptions,
): Promise<void> {
  app.get(
    "/live",
    {
      schema: {
        response: {
          200: LiveResponseSchema,
        },
      },
    },
    async () => {
      return { status: "ok" as const, service: "api" as const };
    },
  );

  app.get(
    "/health",
    {
      schema: {
        response: {
          200: LiveResponseSchema,
        },
      },
    },
    async () => {
      return { status: "ok" as const, service: "api" as const };
    },
  );

  app.get(
    "/ready",
    {
      schema: {
        response: {
          200: ReadyResponseSchema,
          503: NotReadyResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      try {
        await options.prisma.$queryRaw`SELECT 1`;
        await reply.status(200).send({ status: "ok" as const, database: "connected" as const });
      } catch {
        await reply
          .status(503)
          .send({ status: "error" as const, database: "disconnected" as const });
      }
    },
  );
}
