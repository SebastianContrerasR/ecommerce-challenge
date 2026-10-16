import { Type } from "@sinclair/typebox";

export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const IMPORT_MAX_RECORDS = 10000;
export const IMPORT_MAX_ERROR_DETAILS = 100;
export const IMPORT_FILE_FIELD = "file";

export const EXPECTED_CSV_HEADERS = [
  "name",
  "sku",
  "description",
  "category",
  "price",
  "stock",
  "weight_kg",
] as const;

export type ExpectedCsvHeader = (typeof EXPECTED_CSV_HEADERS)[number];

export const ImportErrorSchema = Type.Object(
  {
    record: Type.Integer({ minimum: 0 }),
    field: Type.String({ maxLength: 64 }),
    code: Type.String({ maxLength: 64 }),
    message: Type.String({ maxLength: 500 }),
  },
  { additionalProperties: false },
);

export const ImportSummarySchema = Type.Object(
  {
    totalRecords: Type.Integer({ minimum: 0 }),
    validRecords: Type.Integer({ minimum: 0 }),
    errorCount: Type.Integer({ minimum: 0 }),
    created: Type.Integer({ minimum: 0 }),
    errors: Type.Array(ImportErrorSchema, { maxItems: IMPORT_MAX_ERROR_DETAILS }),
  },
  { additionalProperties: false },
);
