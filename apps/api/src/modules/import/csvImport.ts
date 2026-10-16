import { parse } from "csv-parse/sync";
import {
  EXPECTED_CSV_HEADERS,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_RECORDS,
  PRICE_DECIMAL_PATTERN,
  PRODUCT_CATEGORY_MAX_LENGTH,
  PRODUCT_DESCRIPTION_MAX_LENGTH,
  PRODUCT_NAME_MAX_LENGTH,
  PRODUCT_SKU_MAX_LENGTH,
  PRODUCT_STOCK_MAX,
  WEIGHT_DECIMAL_PATTERN,
} from "@ecommerce/api-contracts";
import { normalizeSku } from "../products/sku.js";
import { ImportServiceError } from "./import.errors.js";

export interface ImportRowError {
  record: number;
  field: string;
  code: string;
  message: string;
}

export interface ValidatedImportRow {
  record: number;
  name: string;
  sku: string;
  description: string;
  category: string;
  price: string;
  stock: number;
  weightKg: string;
}

export interface ParsedImportFile {
  totalRecords: number;
  validRows: ValidatedImportRow[];
  errors: ImportRowError[];
}

const STOCK_PATTERN = "^\\d+$";
const FILE_FIELD = "";

function isRecordBlank(cells: string[]): boolean {
  return cells.every((cell) => cell.trim() === "");
}

function invalidPrice(value: string): boolean {
  if (value.length > 13) {
    return true;
  }
  return new RegExp(PRICE_DECIMAL_PATTERN).test(value) === false;
}

function invalidWeight(value: string): boolean {
  if (value.length > 14) {
    return true;
  }
  return new RegExp(WEIGHT_DECIMAL_PATTERN).test(value) === false;
}

function invalidStock(value: string): boolean {
  if (new RegExp(STOCK_PATTERN).test(value) === false) {
    return true;
  }
  const parsed = Number.parseInt(value, 10);
  return parsed < 0 || parsed > PRODUCT_STOCK_MAX;
}

function validateRowFields(
  record: number,
  fields: Map<string, string>,
  errors: ImportRowError[],
): ValidatedImportRow | null {
  const name = (fields.get("name") ?? "").trim();
  const skuRaw = (fields.get("sku") ?? "").trim();
  const description = (fields.get("description") ?? "").trim();
  const category = (fields.get("category") ?? "").trim();
  const price = (fields.get("price") ?? "").trim();
  const stockRaw = (fields.get("stock") ?? "").trim();
  const weightKg = (fields.get("weight_kg") ?? "").trim();
  const rowErrors: ImportRowError[] = [];

  if (name === "") {
    rowErrors.push({ record, field: "name", code: "REQUIRED", message: "Name is required" });
  } else if (name.length > PRODUCT_NAME_MAX_LENGTH) {
    rowErrors.push({ record, field: "name", code: "INVALID_TEXT", message: "Name is too long" });
  }
  if (skuRaw === "") {
    rowErrors.push({ record, field: "sku", code: "REQUIRED", message: "SKU is required" });
  } else if (skuRaw.length > PRODUCT_SKU_MAX_LENGTH) {
    rowErrors.push({ record, field: "sku", code: "INVALID_TEXT", message: "SKU is too long" });
  }
  if (description.length > PRODUCT_DESCRIPTION_MAX_LENGTH) {
    rowErrors.push({
      record,
      field: "description",
      code: "INVALID_TEXT",
      message: "Description is too long",
    });
  }
  if (category === "") {
    rowErrors.push({
      record,
      field: "category",
      code: "REQUIRED",
      message: "Category is required",
    });
  } else if (category.length > PRODUCT_CATEGORY_MAX_LENGTH) {
    rowErrors.push({
      record,
      field: "category",
      code: "INVALID_TEXT",
      message: "Category is too long",
    });
  }
  if (price === "") {
    rowErrors.push({ record, field: "price", code: "REQUIRED", message: "Price is required" });
  } else if (invalidPrice(price)) {
    rowErrors.push({
      record,
      field: "price",
      code: "INVALID_PRICE",
      message: `Invalid price: ${price}`,
    });
  }
  if (stockRaw === "") {
    rowErrors.push({ record, field: "stock", code: "REQUIRED", message: "Stock is required" });
  } else if (invalidStock(stockRaw)) {
    rowErrors.push({
      record,
      field: "stock",
      code: "INVALID_STOCK",
      message: `Invalid stock: ${stockRaw}`,
    });
  }
  if (weightKg === "") {
    rowErrors.push({
      record,
      field: "weight_kg",
      code: "REQUIRED",
      message: "Weight is required",
    });
  } else if (invalidWeight(weightKg)) {
    rowErrors.push({
      record,
      field: "weight_kg",
      code: "INVALID_WEIGHT",
      message: `Invalid weight: ${weightKg}`,
    });
  }

  for (const rowError of rowErrors) {
    errors.push(rowError);
  }
  if (rowErrors.length > 0 || skuRaw === "") {
    return null;
  }
  return {
    record,
    name,
    sku: normalizeSku(skuRaw),
    description,
    category,
    price,
    stock: Number.parseInt(stockRaw, 10),
    weightKg,
  };
}

function validateHeaders(
  headerCells: string[],
  errors: ImportRowError[],
): Map<string, number> | null {
  const indexByHeader = new Map<string, number>();
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const [index, cell] of headerCells.entries()) {
    const normalized = cell.trim().toLowerCase();
    if (seen.has(normalized)) {
      duplicates.add(normalized);
    }
    seen.add(normalized);
    if (!indexByHeader.has(normalized)) {
      indexByHeader.set(normalized, index);
    }
  }
  let failed = false;
  for (const expected of EXPECTED_CSV_HEADERS) {
    if (!seen.has(expected)) {
      errors.push({
        record: 0,
        field: expected,
        code: "MISSING_HEADER",
        message: `Missing required header: ${expected}`,
      });
      failed = true;
    }
  }
  for (const duplicate of duplicates) {
    errors.push({
      record: 0,
      field: duplicate,
      code: "DUPLICATE_HEADER",
      message: `Duplicate header: ${duplicate}`,
    });
    failed = true;
  }
  for (const actual of seen) {
    if ((EXPECTED_CSV_HEADERS as readonly string[]).includes(actual) === false && actual !== "") {
      errors.push({
        record: 0,
        field: actual,
        code: "UNEXPECTED_HEADER",
        message: `Unexpected header: ${actual}`,
      });
      failed = true;
    }
  }
  if (failed) {
    return null;
  }
  return indexByHeader;
}

export function parseImportCsv(file: Buffer): ParsedImportFile {
  if (file.byteLength > IMPORT_MAX_BYTES) {
    throw new ImportServiceError(
      "FILE_TOO_LARGE",
      413,
      `CSV file exceeds ${IMPORT_MAX_BYTES} bytes`,
      { maxBytes: IMPORT_MAX_BYTES },
    );
  }
  const text = file.toString("utf8").replace(/^\uFEFF/, "");
  let rows: string[][];
  try {
    const parsed: unknown = parse(text, {
      bom: true,
      columns: false,
      skip_empty_lines: true,
      relax_quotes: false,
      relax_column_count: true,
      trim: false,
    });
    if (!Array.isArray(parsed)) {
      throw new Error("CSV parser returned a non-array result");
    }
    rows = parsed as string[][];
  } catch (error) {
    const message = error instanceof Error ? error.message : "Malformed CSV";
    return {
      totalRecords: 0,
      validRows: [],
      errors: [{ record: 0, field: FILE_FIELD, code: "MALFORMED_CSV", message }],
    };
  }
  if (rows.length === 0) {
    return {
      totalRecords: 0,
      validRows: [],
      errors: [{ record: 0, field: FILE_FIELD, code: "EMPTY_FILE", message: "CSV file is empty" }],
    };
  }
  const headerCells = rows[0] ?? [];
  const errors: ImportRowError[] = [];
  const indexByHeader = validateHeaders(headerCells, errors);
  if (indexByHeader === null) {
    return { totalRecords: 0, validRows: [], errors };
  }
  const candidates: Array<{ record: number; fields: Map<string, string> }> = [];
  let recordNumber = 0;
  for (const row of rows.slice(1)) {
    const cells = row.map((cell) => (typeof cell === "string" ? cell : ""));
    if (cells.length === 0 || isRecordBlank(cells)) {
      continue;
    }
    recordNumber += 1;
    if (cells.length !== headerCells.length) {
      errors.push({
        record: recordNumber,
        field: FILE_FIELD,
        code: "COLUMN_COUNT_MISMATCH",
        message: `Expected ${headerCells.length} columns but found ${cells.length}`,
      });
      continue;
    }
    const fields = new Map<string, string>();
    for (const header of EXPECTED_CSV_HEADERS) {
      const index = indexByHeader.get(header);
      if (index !== undefined) {
        fields.set(header, cells[index] ?? "");
      }
    }
    candidates.push({ record: recordNumber, fields });
  }
  if (recordNumber > IMPORT_MAX_RECORDS) {
    return {
      totalRecords: recordNumber,
      validRows: [],
      errors: [
        {
          record: 0,
          field: FILE_FIELD,
          code: "TOO_MANY_RECORDS",
          message: `CSV file exceeds ${IMPORT_MAX_RECORDS} records`,
        },
      ],
    };
  }
  const rowsByRecord = new Map<number, ValidatedImportRow>();
  for (const candidate of candidates) {
    const validated = validateRowFields(candidate.record, candidate.fields, errors);
    if (validated !== null) {
      rowsByRecord.set(candidate.record, validated);
    }
  }
  const skuFirstSeen = new Map<string, number>();
  for (const candidate of candidates) {
    const validated = rowsByRecord.get(candidate.record);
    if (validated === undefined) {
      continue;
    }
    const firstRecord = skuFirstSeen.get(validated.sku);
    if (firstRecord === undefined) {
      skuFirstSeen.set(validated.sku, validated.record);
    } else {
      errors.push({
        record: validated.record,
        field: "sku",
        code: "DUPLICATE_SKU_IN_FILE",
        message: `Duplicate SKU in file, first seen in record ${firstRecord}`,
      });
      rowsByRecord.delete(validated.record);
    }
  }
  return { totalRecords: recordNumber, validRows: [...rowsByRecord.values()], errors };
}
