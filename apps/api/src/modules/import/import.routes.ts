import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import type { PrismaClient } from "../../generated/prisma/client.js";
import {
  ErrorEnvelopeSchema,
  IMPORT_FILE_FIELD,
  ImportSummarySchema,
} from "@ecommerce/api-contracts";
import { missingImportFile } from "./import.errors.js";
import { importProducts } from "./import.service.js";

export interface ImportRouteOptions {
  prisma: PrismaClient;
}

export async function registerImportRoutes(
  app: FastifyInstance,
  options: ImportRouteOptions,
): Promise<void> {
  const imports = app.withTypeProvider<TypeBoxTypeProvider>();
  const prisma = options.prisma;

  imports.post(
    "/api/products/import",
    {
      schema: {
        description:
          "Import products from a CSV file (multipart/form-data field `file`) with header name,sku,description,category,price,stock,weight_kg",
        summary: "Import products via CSV upload",
        consumes: ["multipart/form-data"],
        response: {
          201: ImportSummarySchema,
          400: ErrorEnvelopeSchema,
          409: ErrorEnvelopeSchema,
          413: ErrorEnvelopeSchema,
          422: ImportSummarySchema,
        },
      },
    },
    async (request, reply) => {
      let buffer: Buffer | undefined;
      for await (const part of request.files()) {
        if (part.type !== "file") {
          continue;
        }
        if (part.fieldname === IMPORT_FILE_FIELD && buffer === undefined) {
          buffer = await part.toBuffer();
        } else {
          await part.toBuffer();
        }
      }
      if (buffer === undefined) {
        throw missingImportFile();
      }
      const result = await importProducts(prisma, buffer);
      await reply.status(result.failed ? 422 : 201).send(result.summary);
    },
  );
}
