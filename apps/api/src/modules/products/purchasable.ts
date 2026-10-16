export type PurchaseBlockReason = "PRODUCT_ARCHIVED";

export function getPurchaseBlockReason(product: {
  archivedAt: Date | string | null;
}): PurchaseBlockReason | null {
  if (product.archivedAt !== null) {
    return "PRODUCT_ARCHIVED";
  }
  return null;
}

export function isProductPurchasable(product: { archivedAt: Date | string | null }): boolean {
  return getPurchaseBlockReason(product) === null;
}
