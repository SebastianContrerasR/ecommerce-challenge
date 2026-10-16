import { Type } from "@sinclair/typebox";

export const PRODUCT_SORT_FIELDS = [
  "name",
  "sku",
  "category",
  "price",
  "stock",
  "weightKg",
  "createdAt",
  "updatedAt",
] as const;

export type ProductSortField = (typeof PRODUCT_SORT_FIELDS)[number];

export const PRODUCT_SORT_DIRECTIONS = ["asc", "desc"] as const;

export type ProductSortDirection = (typeof PRODUCT_SORT_DIRECTIONS)[number];

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const PRICE_DECIMAL_PATTERN = "^\\d+(\\.\\d{1,2})?$";
export const WEIGHT_DECIMAL_PATTERN = "^\\d+(\\.\\d{1,3})?$";
export const PRODUCT_NAME_MAX_LENGTH = 200;
export const PRODUCT_SKU_MAX_LENGTH = 64;
export const PRODUCT_DESCRIPTION_MAX_LENGTH = 2000;
export const PRODUCT_CATEGORY_MAX_LENGTH = 100;
export const PRODUCT_STOCK_MAX = 2147483647;

const priceStringSchema = Type.String({
  pattern: PRICE_DECIMAL_PATTERN,
  maxLength: 13,
});

const weightKgStringSchema = Type.String({
  pattern: WEIGHT_DECIMAL_PATTERN,
  maxLength: 14,
});

export const ProductSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    name: Type.String({ minLength: 1, maxLength: PRODUCT_NAME_MAX_LENGTH }),
    sku: Type.String({ minLength: 1, maxLength: PRODUCT_SKU_MAX_LENGTH }),
    description: Type.String({ maxLength: PRODUCT_DESCRIPTION_MAX_LENGTH }),
    category: Type.String({ minLength: 1, maxLength: PRODUCT_CATEGORY_MAX_LENGTH }),
    price: priceStringSchema,
    stock: Type.Integer({ minimum: 0, maximum: PRODUCT_STOCK_MAX }),
    weightKg: weightKgStringSchema,
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
    archivedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
  },
  { additionalProperties: false },
);

export const CreateProductSchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: PRODUCT_NAME_MAX_LENGTH }),
    sku: Type.String({ minLength: 1, maxLength: PRODUCT_SKU_MAX_LENGTH }),
    description: Type.Optional(Type.String({ maxLength: PRODUCT_DESCRIPTION_MAX_LENGTH })),
    category: Type.String({ minLength: 1, maxLength: PRODUCT_CATEGORY_MAX_LENGTH }),
    price: priceStringSchema,
    stock: Type.Integer({ minimum: 0, maximum: PRODUCT_STOCK_MAX }),
    weightKg: weightKgStringSchema,
  },
  { additionalProperties: false },
);

export const UpdateProductSchema = Type.Object(
  {
    name: Type.Optional(Type.String({ minLength: 1, maxLength: PRODUCT_NAME_MAX_LENGTH })),
    sku: Type.Optional(Type.String({ minLength: 1, maxLength: PRODUCT_SKU_MAX_LENGTH })),
    description: Type.Optional(Type.String({ maxLength: PRODUCT_DESCRIPTION_MAX_LENGTH })),
    category: Type.Optional(Type.String({ minLength: 1, maxLength: PRODUCT_CATEGORY_MAX_LENGTH })),
    price: Type.Optional(priceStringSchema),
    stock: Type.Optional(Type.Integer({ minimum: 0, maximum: PRODUCT_STOCK_MAX })),
    weightKg: Type.Optional(weightKgStringSchema),
  },
  { additionalProperties: false, minProperties: 1 },
);

export const ProductParamsSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
  },
  { additionalProperties: false },
);

export const ListProductsQuerySchema = Type.Object(
  {
    q: Type.Optional(Type.String({ maxLength: 200 })),
    category: Type.Optional(Type.String({ maxLength: 100 })),
    sort: Type.Optional(Type.String({ maxLength: 20 })),
    order: Type.Optional(Type.String({ maxLength: 10 })),
    page: Type.Optional(Type.String({ pattern: "^\\d+$", maxLength: 10 })),
    pageSize: Type.Optional(Type.String({ pattern: "^\\d+$", maxLength: 10 })),
    includeArchived: Type.Optional(Type.String({ maxLength: 5 })),
  },
  { additionalProperties: false },
);

export const ProductListResponseSchema = Type.Object(
  {
    data: Type.Array(ProductSchema),
    pagination: Type.Object(
      {
        page: Type.Integer({ minimum: 1 }),
        pageSize: Type.Integer({ minimum: 1 }),
        totalItems: Type.Integer({ minimum: 0 }),
        totalPages: Type.Integer({ minimum: 0 }),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);
