-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "weight_kg" DECIMAL(10,3) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "archived_at" TIMESTAMPTZ,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE INDEX "products_archived_at_idx" ON "products"("archived_at");

-- CreateIndex
CREATE INDEX "products_category_idx" ON "products"("category");

-- CreateIndex
CREATE INDEX "products_created_at_idx" ON "products"("created_at");

ALTER TABLE "products" ADD CONSTRAINT "products_price_nonnegative" CHECK ("price" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_stock_nonnegative" CHECK ("stock" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_weight_kg_nonnegative" CHECK ("weight_kg" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_name_length" CHECK (char_length("name") BETWEEN 1 AND 200);
ALTER TABLE "products" ADD CONSTRAINT "products_sku_length" CHECK (char_length("sku") BETWEEN 1 AND 64);
ALTER TABLE "products" ADD CONSTRAINT "products_category_length" CHECK (char_length("category") BETWEEN 1 AND 100);
ALTER TABLE "products" ADD CONSTRAINT "products_description_length" CHECK (char_length("description") BETWEEN 0 AND 2000);
