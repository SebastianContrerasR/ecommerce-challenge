export class ProductServiceError extends Error {
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
    this.name = "ProductServiceError";
    this.code = code;
    this.statusCode = statusCode;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export function productNotFound(id: string): ProductServiceError {
  return new ProductServiceError("PRODUCT_NOT_FOUND", 404, `Product not found: ${id}`, { id });
}

export function skuExists(sku: string): ProductServiceError {
  return new ProductServiceError("SKU_EXISTS", 409, `SKU already exists: ${sku}`, { sku });
}

export function productArchived(id: string): ProductServiceError {
  return new ProductServiceError("PRODUCT_ARCHIVED", 409, `Product is archived: ${id}`, { id });
}
