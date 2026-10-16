import type { Static } from "@sinclair/typebox";
import type {
  CreateProductSchema,
  ProductListResponseSchema,
  ProductSchema,
  UpdateProductSchema,
} from "@ecommerce/api-contracts";
import { apiFetch, readJson } from "./client.js";

export type Product = Static<typeof ProductSchema>;
export type ProductList = Static<typeof ProductListResponseSchema>;
export type CreateProductInput = Static<typeof CreateProductSchema>;
export type UpdateProductInput = Static<typeof UpdateProductSchema>;

export interface ProductListParams {
  q?: string | undefined;
  category?: string | undefined;
  sort?: string | undefined;
  order?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
  includeArchived?: boolean | undefined;
}

export function buildProductListPath(params: ProductListParams): string {
  const search = new URLSearchParams();
  if (params.q !== undefined && params.q !== "") {
    search.set("q", params.q);
  }
  if (params.category !== undefined && params.category !== "") {
    search.set("category", params.category);
  }
  if (params.sort !== undefined && params.sort !== "") {
    search.set("sort", params.sort);
  }
  if (params.order !== undefined && params.order !== "") {
    search.set("order", params.order);
  }
  if (params.page !== undefined) {
    search.set("page", String(params.page));
  }
  if (params.pageSize !== undefined) {
    search.set("pageSize", String(params.pageSize));
  }
  if (params.includeArchived === true) {
    search.set("includeArchived", "true");
  }
  const query = search.toString();
  return query === "" ? "/api/products" : `/api/products?${query}`;
}

export async function fetchProducts(
  baseUrl: string,
  params: ProductListParams,
): Promise<ProductList> {
  const response = await apiFetch(baseUrl, buildProductListPath(params));
  return readJson<ProductList>(response);
}

export async function fetchProduct(baseUrl: string, id: string): Promise<Product> {
  const response = await apiFetch(baseUrl, `/api/products/${id}`);
  return readJson<Product>(response);
}

export async function createProduct(baseUrl: string, input: CreateProductInput): Promise<Product> {
  const response = await apiFetch(baseUrl, "/api/products", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return readJson<Product>(response);
}

export async function updateProduct(
  baseUrl: string,
  id: string,
  patch: UpdateProductInput,
): Promise<Product> {
  const response = await apiFetch(baseUrl, `/api/products/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  return readJson<Product>(response);
}

export async function archiveProduct(baseUrl: string, id: string): Promise<Product> {
  const response = await apiFetch(baseUrl, `/api/products/${id}`, { method: "DELETE" });
  return readJson<Product>(response);
}
