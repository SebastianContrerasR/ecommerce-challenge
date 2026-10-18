import type { Static } from "@sinclair/typebox";
import type { CreateProductSchema, UpdateProductSchema } from "@ecommerce/api-contracts";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { normalizeSku } from "./sku.js";
import { parseListQuery } from "./listing.js";
import type { RawListQuery } from "./listing.js";
import { toProductResponse } from "./mapper.js";
import type { ProductResponse } from "./mapper.js";
import {
  ProductServiceError,
  productArchived,
  productNotFound,
  skuExists,
} from "./products.errors.js";

type CreateProductInput = Static<typeof CreateProductSchema>;
type UpdateProductInput = Static<typeof UpdateProductSchema>;

export interface ProductPagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface ProductListResult {
  data: ProductResponse[];
  pagination: ProductPagination;
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  return (error as { code?: unknown }).code === "P2002";
}

function rejectBlankText(value: string, field: "name" | "category"): void {
  if (value.trim() === "") {
    throw new ProductServiceError("VALIDATION_ERROR", 400, `${field} must not be blank`, {
      field,
    });
  }
}

export async function createProduct(
  prisma: PrismaClient,
  input: CreateProductInput,
): Promise<ProductResponse> {
  const sku = normalizeSku(input.sku);
  rejectBlankText(input.name, "name");
  rejectBlankText(input.category, "category");
  const existing = await prisma.product.findUnique({ where: { sku } });
  if (existing !== null) {
    throw skuExists(sku);
  }
  try {
    const created = await prisma.product.create({
      data: {
        name: input.name,
        sku,
        description: input.description ?? "",
        category: input.category,
        price: input.price,
        stock: input.stock,
        weightKg: input.weightKg,
      },
    });
    return toProductResponse(created);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw skuExists(sku);
    }
    throw error;
  }
}

export async function getProductById(prisma: PrismaClient, id: string): Promise<ProductResponse> {
  const product = await prisma.product.findUnique({ where: { id } });
  if (product === null) {
    throw productNotFound(id);
  }
  return toProductResponse(product);
}

export async function listProducts(
  prisma: PrismaClient,
  rawQuery: RawListQuery,
): Promise<ProductListResult> {
  const query = parseListQuery(rawQuery);
  const conditions: Prisma.ProductWhereInput[] = [];
  if (query.searchText !== undefined) {
    conditions.push({
      OR: [
        { name: { contains: query.searchText, mode: "insensitive" } },
        { sku: { contains: query.searchText, mode: "insensitive" } },
        { description: { contains: query.searchText, mode: "insensitive" } },
        { category: { contains: query.searchText, mode: "insensitive" } },
      ],
    });
  }
  if (query.categoryFilter !== undefined) {
    conditions.push({ category: { equals: query.categoryFilter, mode: "insensitive" } });
  }
  const where: Prisma.ProductWhereInput = {};
  if (!query.includeArchived) {
    where.archivedAt = null;
  }
  if (query.inStock) {
    where.stock = { gt: 0 };
  }
  if (conditions.length > 0) {
    where.AND = conditions;
  }
  const skip = (query.page - 1) * query.pageSize;
  const [totalItems, products] = await prisma.$transaction([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: { [query.sort]: query.order },
      skip,
      take: query.pageSize,
    }),
  ]);
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize);
  return {
    data: products.map(toProductResponse),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages,
    },
  };
}

export async function updateProduct(
  prisma: PrismaClient,
  id: string,
  patch: UpdateProductInput,
): Promise<ProductResponse> {
  const current = await prisma.product.findUnique({ where: { id } });
  if (current === null) {
    throw productNotFound(id);
  }
  if (current.archivedAt !== null) {
    throw productArchived(id);
  }
  if (patch.name !== undefined) {
    rejectBlankText(patch.name, "name");
  }
  if (patch.category !== undefined) {
    rejectBlankText(patch.category, "category");
  }
  let sku: string | undefined;
  if (patch.sku !== undefined) {
    sku = normalizeSku(patch.sku);
    if (sku !== current.sku) {
      const conflicting = await prisma.product.findUnique({ where: { sku } });
      if (conflicting !== null) {
        throw skuExists(sku);
      }
    }
  }
  try {
    const updated = await prisma.product.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(sku !== undefined ? { sku } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {}),
        ...(patch.price !== undefined ? { price: patch.price } : {}),
        ...(patch.stock !== undefined ? { stock: patch.stock } : {}),
        ...(patch.weightKg !== undefined ? { weightKg: patch.weightKg } : {}),
      },
    });
    return toProductResponse(updated);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw skuExists(sku ?? patch.sku ?? "");
    }
    throw error;
  }
}

export async function archiveProduct(prisma: PrismaClient, id: string): Promise<ProductResponse> {
  const current = await prisma.product.findUnique({ where: { id } });
  if (current === null) {
    throw productNotFound(id);
  }
  if (current.archivedAt !== null) {
    throw productArchived(id);
  }
  const archived = await prisma.product.update({
    where: { id },
    data: { archivedAt: new Date() },
  });
  return toProductResponse(archived);
}
