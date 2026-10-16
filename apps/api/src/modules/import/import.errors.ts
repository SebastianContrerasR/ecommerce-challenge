export class ImportServiceError extends Error {
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
    this.name = "ImportServiceError";
    this.code = code;
    this.statusCode = statusCode;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export function missingImportFile(): ImportServiceError {
  return new ImportServiceError(
    "IMPORT_MISSING_FILE",
    400,
    'Expected multipart file field "file"',
    { field: "file" },
  );
}

export function importConflict(sku: string): ImportServiceError {
  return new ImportServiceError(
    "IMPORT_CONFLICT",
    409,
    `Conflicting concurrent insert for SKU: ${sku}`,
    { sku },
  );
}
