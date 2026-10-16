import type { Static } from "@sinclair/typebox";
import type { ImportSummarySchema } from "@ecommerce/api-contracts";
import { ApiError } from "./client.js";

export type ImportSummary = Static<typeof ImportSummarySchema>;

interface ErrorBody {
  error?: { code?: string; message?: string };
}

export async function importProductsCsv(baseUrl: string, file: File): Promise<ImportSummary> {
  const form = new FormData();
  form.append("file", file, file.name);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/products/import`, { method: "POST", body: form });
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Network request failed", {
      cause: error,
    });
  }
  if (response.status === 201 || response.status === 422) {
    return (await response.json()) as ImportSummary;
  }
  const body: ErrorBody = await response.json().catch(() => ({}));
  throw new ApiError(
    body.error?.code ?? "REQUEST_FAILED",
    body.error?.message ?? `Import failed with status ${response.status}`,
    response.status,
  );
}
