import { ORDER_STATUS_PAID, PAYMENT_STATUS_SUCCEEDED } from "@ecommerce/api-contracts";
import type {
  Order as PrismaOrder,
  OrderItem as PrismaOrderItem,
} from "../../generated/prisma/client.js";

export interface OrderItemResponse {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
}

export interface OrderResponse {
  id: string;
  status: typeof ORDER_STATUS_PAID;
  paymentStatus: typeof PAYMENT_STATUS_SUCCEEDED;
  paymentReference: string;
  total: string;
  items: OrderItemResponse[];
  createdAt: string;
}

export function toOrderResponse(order: PrismaOrder & { items: PrismaOrderItem[] }): OrderResponse {
  return {
    id: order.id,
    status: ORDER_STATUS_PAID,
    paymentStatus: PAYMENT_STATUS_SUCCEEDED,
    paymentReference: order.paymentReference,
    total: order.total.toFixed(2),
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      productSku: item.productSku,
      unitPrice: item.unitPrice.toFixed(2),
      quantity: item.quantity,
      lineTotal: item.lineTotal.toFixed(2),
    })),
    createdAt: order.createdAt.toISOString(),
  };
}
