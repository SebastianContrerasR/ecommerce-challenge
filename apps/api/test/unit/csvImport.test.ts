import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ERROR_DETAILS,
  IMPORT_MAX_RECORDS,
} from "@ecommerce/api-contracts";
import { parseImportCsv } from "../../src/modules/import/csvImport.js";
import type { ImportRowError } from "../../src/modules/import/csvImport.js";
import { ImportServiceError } from "../../src/modules/import/import.errors.js";

function fixture(name: string): Buffer {
  return readFileSync(new URL(`../fixtures/csv/${name}`, import.meta.url));
}

function codes(errors: ImportRowError[]): string[] {
  return errors.map((error) => error.code);
}

describe("parseImportCsv", () => {
  it("parses multiple valid products with normalized SKUs", () => {
    const parsed = parseImportCsv(fixture("valid-three.csv"));
    expect(parsed.totalRecords).toBe(3);
    expect(parsed.errors).toEqual([]);
    expect(parsed.validRows.map((row) => row.sku)).toEqual(["TR-101", "CC-102", "SB-103"]);
    expect(parsed.validRows[0]).toMatchObject({ price: "129.99", stock: 40, weightKg: "0.42" });
  });

  it("parses the challenge example record exactly as supplied", () => {
    const parsed = parseImportCsv(fixture("challenge-example.csv"));
    expect(parsed.totalRecords).toBe(1);
    expect(parsed.errors).toEqual([]);
    expect(parsed.validRows).toHaveLength(1);
    expect(parsed.validRows[0]).toEqual({
      record: 1,
      name: "Running Shoes",
      sku: "RS-001",
      description: "Lightweight running shoes for daily training",
      category: "Footwear",
      price: "89.99",
      stock: 150,
      weightKg: "0.35",
    });
  });

  it("supports quoted commas in descriptions", () => {
    const parsed = parseImportCsv(fixture("quoted-commas.csv"));
    expect(parsed.errors).toEqual([]);
    expect(parsed.validRows[0]?.description).toBe("Water-resistant pack, 25L, laptop sleeve");
  });

  it("supports escaped double quotes", () => {
    const parsed = parseImportCsv(fixture("escaped-quotes.csv"));
    expect(parsed.errors).toEqual([]);
    expect(parsed.validRows[0]?.name).toBe('Quote "Inside" Name');
    expect(parsed.validRows[1]?.description).toBe('12oz mug with "dishwasher safe" print');
  });

  it("supports multiline descriptions with data-record ordinals", () => {
    const parsed = parseImportCsv(fixture("multiline.csv"));
    expect(parsed.errors).toEqual([]);
    expect(parsed.totalRecords).toBe(2);
    expect(parsed.validRows[0]?.description).toBe("4-person dome tent\nwaterproof 3000mm rating");
    expect(parsed.validRows.map((row) => row.record)).toEqual([1, 2]);
  });

  it("supports CRLF endings and a UTF-8 BOM", () => {
    const parsed = parseImportCsv(fixture("crlf-bom.csv"));
    expect(parsed.errors).toEqual([]);
    expect(parsed.validRows.map((row) => row.sku)).toEqual(["WS-501", "DC-502"]);
  });

  it("accepts reordered columns and trims case-insensitive headers", () => {
    const reordered = parseImportCsv(fixture("reordered-columns.csv"));
    expect(reordered.errors).toEqual([]);
    expect(reordered.validRows[0]).toMatchObject({ sku: "RC-001", price: "10.00" });
    const cased = parseImportCsv(fixture("cased-headers.csv"));
    expect(cased.errors).toEqual([]);
    expect(cased.validRows[0]?.sku).toBe("CH-001");
  });

  it("rejects missing headers", () => {
    const parsed = parseImportCsv(fixture("missing-headers.csv"));
    expect(parsed.totalRecords).toBe(0);
    expect(parsed.validRows).toEqual([]);
    expect(codes(parsed.errors)).toEqual(["MISSING_HEADER"]);
    expect(parsed.errors[0]).toMatchObject({ record: 0, field: "price" });
  });

  it("rejects duplicate headers", () => {
    const parsed = parseImportCsv(fixture("duplicate-headers.csv"));
    expect(parsed.validRows).toEqual([]);
    expect(codes(parsed.errors)).toEqual(["DUPLICATE_HEADER"]);
    expect(parsed.errors[0]).toMatchObject({ record: 0, field: "sku" });
  });

  it("rejects unexpected headers instead of dropping data", () => {
    const parsed = parseImportCsv(fixture("unexpected-headers.csv"));
    expect(parsed.validRows).toEqual([]);
    expect(codes(parsed.errors)).toEqual(["UNEXPECTED_HEADER"]);
    expect(parsed.errors[0]).toMatchObject({ record: 0, field: "color" });
  });

  it("rejects malformed CSV with unterminated quotes", () => {
    const parsed = parseImportCsv(fixture("malformed.csv"));
    expect(parsed.validRows).toEqual([]);
    expect(codes(parsed.errors)).toEqual(["MALFORMED_CSV"]);
    expect(parsed.errors[0]?.record).toBe(0);
  });

  it("collects missing required fields without discarding comma-only lines silently", () => {
    const parsed = parseImportCsv(fixture("missing-fields.csv"));
    expect(parsed.totalRecords).toBe(3);
    expect(codes(parsed.errors)).toEqual(["REQUIRED", "REQUIRED", "REQUIRED"]);
    expect(parsed.errors[0]).toMatchObject({ record: 1, field: "name" });
    expect(parsed.errors[1]).toMatchObject({ record: 2, field: "price" });
    expect(parsed.errors[2]).toMatchObject({ record: 3, field: "weight_kg" });
  });

  it("rejects malformed, negative, and over-precise decimals", () => {
    const parsed = parseImportCsv(fixture("invalid-decimals.csv"));
    expect(parsed.validRows).toEqual([]);
    expect(parsed.errors.map((error) => `${error.record}:${error.code}`)).toEqual([
      "1:INVALID_PRICE",
      "2:INVALID_PRICE",
      "3:INVALID_PRICE",
      "4:INVALID_PRICE",
      "5:INVALID_WEIGHT",
      "6:INVALID_WEIGHT",
    ]);
  });

  it("rejects fractional, negative, huge, and alphabetic stock", () => {
    const parsed = parseImportCsv(fixture("invalid-stock.csv"));
    expect(parsed.validRows).toEqual([]);
    expect(parsed.errors.map((error) => `${error.record}:${error.field}`)).toEqual([
      "1:stock",
      "2:stock",
      "3:stock",
      "4:stock",
    ]);
    expect(new Set(codes(parsed.errors))).toEqual(new Set(["INVALID_STOCK"]));
  });

  it("flags duplicate SKUs within the file after normalization", () => {
    const parsed = parseImportCsv(fixture("duplicate-in-file.csv"));
    expect(parsed.totalRecords).toBe(3);
    expect(codes(parsed.errors)).toEqual(["DUPLICATE_SKU_IN_FILE"]);
    expect(parsed.errors[0]).toMatchObject({ record: 2, field: "sku" });
    expect(parsed.validRows.map((row) => row.sku)).toEqual(["DF-001", "UI-002"]);
  });

  it("ignores entirely blank records", () => {
    const parsed = parseImportCsv(fixture("blank-records.csv"));
    expect(parsed.errors).toEqual([]);
    expect(parsed.totalRecords).toBe(3);
    expect(parsed.validRows.map((row) => row.sku)).toEqual(["SP-001", "SP-002", "SP-003"]);
  });

  it("rejects empty files and accepts header-only files", () => {
    const empty = parseImportCsv(Buffer.alloc(0));
    expect(codes(empty.errors)).toEqual(["EMPTY_FILE"]);
    const headerOnly = parseImportCsv(fixture("header-only.csv"));
    expect(headerOnly).toMatchObject({ totalRecords: 0, validRows: [], errors: [] });
  });

  it("rejects files exceeding the byte limit", () => {
    const oversized = Buffer.alloc(IMPORT_MAX_BYTES + 1, 97);
    try {
      parseImportCsv(oversized);
    } catch (error) {
      expect(error).toBeInstanceOf(ImportServiceError);
      const serviceError = error as ImportServiceError;
      expect(serviceError.code).toBe("FILE_TOO_LARGE");
      expect(serviceError.statusCode).toBe(413);
      return;
    }
    throw new Error("Expected FILE_TOO_LARGE");
  });

  it("rejects files exceeding the record limit", () => {
    const lines = ["name,sku,description,category,price,stock,weight_kg"];
    for (let index = 1; index <= IMPORT_MAX_RECORDS + 1; index += 1) {
      lines.push(`Item ${index},RL-${index},Description,Category,10.00,5,0.200`);
    }
    const parsed = parseImportCsv(Buffer.from(lines.join("\n"), "utf8"));
    expect(parsed.validRows).toEqual([]);
    expect(codes(parsed.errors)).toEqual(["TOO_MANY_RECORDS"]);
    expect(parsed.totalRecords).toBe(IMPORT_MAX_RECORDS + 1);
  });

  it("caps detailed errors while the count stays exact", () => {
    const lines = ["name,sku,description,category,price,stock,weight_kg"];
    for (let index = 1; index <= IMPORT_MAX_ERROR_DETAILS + 50; index += 1) {
      lines.push(`,BAD-${index},Missing name,Category,10.00,5,0.200`);
    }
    const parsed = parseImportCsv(Buffer.from(lines.join("\n"), "utf8"));
    expect(parsed.errors.length).toBe(IMPORT_MAX_ERROR_DETAILS + 50);
  });

  it("parses the supplied example file with verbatim special names", () => {
    const parsed = parseImportCsv(fixture("../../../../../docs/example.csv"));
    expect(parsed.totalRecords).toBe(95);
    expect(parsed.validRows.length).toBe(85);
    expect(parsed.errors.length).toBe(10);
    const byCode = new Map<string, number>();
    for (const error of parsed.errors) {
      byCode.set(error.code, (byCode.get(error.code) ?? 0) + 1);
    }
    expect([...byCode.entries()].sort()).toEqual([
      ["DUPLICATE_SKU_IN_FILE", 3],
      ["INVALID_PRICE", 2],
      ["INVALID_STOCK", 1],
      ["REQUIRED", 4],
    ]);
    const names = new Map(parsed.validRows.map((row) => [row.sku, row.name]));
    expect(names.get("XS-001")).toBe("<script>alert('xss')</script>");
    expect(names.get("SQL-001")).toBe("Robert'); DROP TABLE products;--");
    expect(names.has("WS-001")).toBe(false);
  });
});
