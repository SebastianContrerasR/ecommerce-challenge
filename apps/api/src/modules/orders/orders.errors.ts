export class OrderServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    statusCode: number,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "OrderServiceError";
    this.code = code;
    this.statusCode = statusCode;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export function orderNotFound(id: string): OrderServiceError {
  return new OrderServiceError("ORDER_NOT_FOUND", 404, `Order not found: ${id}`, { id });
}

export function insufficientStock(productId: string): OrderServiceError {
  return new OrderServiceError(
    "INSUFFICIENT_STOCK",
    409,
    `Insufficient stock for product: ${productId}`,
    { productId },
  );
}

export function idempotencyKeyConflict(): OrderServiceError {
  return new OrderServiceError(
    "IDEMPOTENCY_KEY_CONFLICT",
    409,
    "Idempotency key was already used with a different request",
    {},
  );
}
