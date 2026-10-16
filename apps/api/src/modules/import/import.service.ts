import type { Static } from "@sinclair/typebox";
import type { ImportSummarySchema } from "@ecommerce/api-contracts";
import { IMPORT_MAX_ERROR_DETAILS } from "@ecommerce/api-contracts";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { parseImportCsv } from "./csvImport.js";
import type { ImportRowError, ValidatedImportRow } from "./csvImport.js";
import { importConflict } from "./import.errors.js";

export type ImportSummary = Static<typeof ImportSummarySchema>;

export interface ImportResult {
  failed: boolean;
  summary: ImportSummary;
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  return (error as { code?: unknown }).code === "P2002";
}

function recordsWithErrors(errors: ImportRowError[]): Set<number> {
  const records = new Set<number>();
  for (const error of errors) {
    if (error.record > 0) {
      records.add(error.record);
    }
  }
  return records;
}

function buildSummary(
  totalRecords: number,
  validRecords: number,
  errors: ImportRowError[],
  created: number,
): ImportSummary {
  return {
    totalRecords,
    validRecords,
    errorCount: errors.length,
    created,
    errors: errors.slice(0, IMPORT_MAX_ERROR_DETAILS),
  };
}

export async function persistImportRows(
  prisma: PrismaClient,
  rows: ValidatedImportRow[],
): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  try {
    await prisma.$transaction(async (tx) => {
      await tx.product.createMany({
        data: rows.map((row) => ({
          name: row.name,
          sku: row.sku,
          description: row.description,
          category: row.category,
          price: row.price,
          stock: row.stock,
          weightKg: row.weightKg,
        })),
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw importConflict(rows[0]?.sku ?? "");
    }
    throw error;
  }
}

export async function importProducts(prisma: PrismaClient, file: Buffer): Promise<ImportResult> {
  const parsed = parseImportCsv(file);
  if (parsed.errors.length > 0) {
    const invalid = recordsWithErrors(parsed.errors).size;
    return {
      failed: true,
      summary: buildSummary(parsed.totalRecords, parsed.totalRecords - invalid, parsed.errors, 0),
    };
  }
  if (parsed.validRows.length === 0) {
    return {
      failed: false,
      summary: buildSummary(parsed.totalRecords, 0, [], 0),
    };
  }
  const skus = [...new Set(parsed.validRows.map((row) => row.sku))];
  const existing = await prisma.product.findMany({
    where: { sku: { in: skus } },
    select: { sku: true },
  });
  if (existing.length > 0) {
    const existingSkus = new Set(existing.map((item) => item.sku));
    const errors: ImportRowError[] = [];
    for (const row of parsed.validRows) {
      if (existingSkus.has(row.sku)) {
        errors.push({
          record: row.record,
          field: "sku",
          code: "SKU_EXISTS",
          message: `SKU already exists: ${row.sku}`,
        });
      }
    }
    const invalid = recordsWithErrors(errors).size;
    return {
      failed: true,
      summary: buildSummary(parsed.totalRecords, parsed.totalRecords - invalid, errors, 0),
    };
  }
  await persistImportRows(prisma, parsed.validRows);
  return {
    failed: false,
    summary: buildSummary(
      parsed.totalRecords,
      parsed.validRows.length,
      [],
      parsed.validRows.length,
    ),
  };
}
