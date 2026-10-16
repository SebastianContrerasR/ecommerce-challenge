import type { Static } from "@sinclair/typebox";
import type { OrderSchema } from "@ecommerce/api-contracts";
import { apiFetch, readJson } from "./client.js";

export type Order = Static<typeof OrderSchema>;

export interface OrderLineInput {
  productId: string;
  quantity: number;
}

export async function createOrder(
  baseUrl: string,
  items: OrderLineInput[],
  idempotencyKey: string,
): Promise<Order> {
  const response = await apiFetch(baseUrl, "/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
    body: JSON.stringify({ items }),
  });
  return readJson<Order>(response);
}

export async function fetchOrder(baseUrl: string, id: string): Promise<Order> {
  const response = await apiFetch(baseUrl, `/api/orders/${id}`);
  return readJson<Order>(response);
}
