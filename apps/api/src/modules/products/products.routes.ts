import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import type { PrismaClient } from "../../generated/prisma/client.js";
import {
  CreateProductSchema,
  ErrorEnvelopeSchema,
  ListProductsQuerySchema,
  ProductListResponseSchema,
  ProductParamsSchema,
  ProductSchema,
  UpdateProductSchema,
} from "@ecommerce/api-contracts";
import {
  archiveProduct,
  createProduct,
  getProductById,
  listProducts,
  updateProduct,
} from "./products.service.js";

export interface ProductRouteOptions {
  prisma: PrismaClient;
}

export async function registerProductRoutes(
  app: FastifyInstance,
  options: ProductRouteOptions,
): Promise<void> {
  const products = app.withTypeProvider<TypeBoxTypeProvider>();
  const prisma = options.prisma;

  products.get(
    "/api/products",
    {
      schema: {
        querystring: ListProductsQuerySchema,
        response: {
          200: ProductListResponseSchema,
          400: ErrorEnvelopeSchema,
        },
      },
    },
    async (request) => {
      return listProducts(prisma, request.query);
    },
  );

  products.get(
    "/api/products/:id",
    {
      schema: {
        params: ProductParamsSchema,
        response: {
          200: ProductSchema,
          400: ErrorEnvelopeSchema,
          404: ErrorEnvelopeSchema,
        },
      },
    },
    async (request) => {
      return getProductById(prisma, request.params.id);
    },
  );

  products.post(
    "/api/products",
    {
      schema: {
        body: CreateProductSchema,
        response: {
          201: ProductSchema,
          400: ErrorEnvelopeSchema,
          409: ErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const created = await createProduct(prisma, request.body);
      await reply.status(201).send(created);
    },
  );

  products.patch(
    "/api/products/:id",
    {
      schema: {
        params: ProductParamsSchema,
        body: UpdateProductSchema,
        response: {
          200: ProductSchema,
          400: ErrorEnvelopeSchema,
          404: ErrorEnvelopeSchema,
          409: ErrorEnvelopeSchema,
        },
      },
    },
    async (request) => {
      return updateProduct(prisma, request.params.id, request.body);
    },
  );

  products.delete(
    "/api/products/:id",
    {
      schema: {
        params: ProductParamsSchema,
        response: {
          200: ProductSchema,
          400: ErrorEnvelopeSchema,
          404: ErrorEnvelopeSchema,
          409: ErrorEnvelopeSchema,
        },
      },
    },
    async (request) => {
      return archiveProduct(prisma, request.params.id);
    },
  );
}
