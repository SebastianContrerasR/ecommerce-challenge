import type { Product as PrismaProduct } from "../../generated/prisma/client.js";

export interface ProductResponse {
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

export function toProductResponse(product: PrismaProduct): ProductResponse {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    description: product.description,
    category: product.category,
    price: product.price.toFixed(2),
    stock: product.stock,
    weightKg: product.weightKg.toFixed(3),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    archivedAt: product.archivedAt ? product.archivedAt.toISOString() : null,
  };
}
