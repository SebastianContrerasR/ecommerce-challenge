import { Type } from "@sinclair/typebox";
import { PRODUCT_STOCK_MAX } from "./products.js";

export const ORDER_STATUS_PAID = "PAID";
export const PAYMENT_STATUS_SUCCEEDED = "SUCCEEDED";
export const ORDER_MAX_ITEMS = 100;
export const IDEMPOTENCY_KEY_MAX_LENGTH = 128;

export const OrderItemInputSchema = Type.Object(
  {
    productId: Type.String({ format: "uuid" }),
    quantity: Type.Integer({ minimum: 1, maximum: PRODUCT_STOCK_MAX }),
  },
  { additionalProperties: false },
);

export const CreateOrderSchema = Type.Object(
  {
    items: Type.Array(OrderItemInputSchema, { minItems: 1, maxItems: ORDER_MAX_ITEMS }),
  },
  { additionalProperties: false },
);

export const IdempotencyKeyHeadersSchema = Type.Object(
  {
    "idempotency-key": Type.String({ minLength: 1, maxLength: IDEMPOTENCY_KEY_MAX_LENGTH }),
  },
  { additionalProperties: true },
);

export const OrderParamsSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
  },
  { additionalProperties: false },
);

export const OrderItemSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    productId: Type.String({ format: "uuid" }),
    productName: Type.String(),
    productSku: Type.String(),
    unitPrice: Type.String({ pattern: "^\\d+(\\.\\d{1,2})?$" }),
    quantity: Type.Integer({ minimum: 1 }),
    lineTotal: Type.String({ pattern: "^\\d+(\\.\\d{1,2})?$" }),
  },
  { additionalProperties: false },
);

export const OrderSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    status: Type.Literal(ORDER_STATUS_PAID),
    paymentStatus: Type.Literal(PAYMENT_STATUS_SUCCEEDED),
    paymentReference: Type.String(),
    total: Type.String({ pattern: "^\\d+(\\.\\d{1,2})?$" }),
    items: Type.Array(OrderItemSchema),
    createdAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
