import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getApiBaseUrl } from "../api/client.js";
import { fetchProducts } from "../api/products.js";
import { importProductsCsv } from "../api/import.js";
import type { ImportSummary } from "../api/import.js";
import { formatMoney } from "../format.js";

export function ImportPage() {
  const [apiBaseUrl] = useState<string>(() => getApiBaseUrl());
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const catalog = useQuery({
    queryKey: ["products", "recent"],
    queryFn: () =>
      fetchProducts(apiBaseUrl, { sort: "createdAt", order: "desc", page: 1, pageSize: 10 }),
  });

  const upload = useMutation({
    mutationFn: (selected: File) => importProductsCsv(apiBaseUrl, selected),
    onSuccess: (result) => {
      setFailure(null);
      setSummary(result);
      if (result.errorCount === 0) {
        void queryClient.invalidateQueries({ queryKey: ["products"] });
      }
    },
    onError: (error) => {
      setSummary(null);
      setFailure(error instanceof Error ? error.message : "Import failed.");
    },
  });

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault();
    if (file === null || upload.isPending) {
      return;
    }
    upload.mutate(file);
  }

  function handleReset(): void {
    setFile(null);
    setSummary(null);
    setFailure(null);
    upload.reset();
  }

  const visibleErrors = summary?.errors.slice(0, 20) ?? [];

  return (
    <section aria-label="Import products">
      <h2 className="text-xl font-semibold text-slate-900">Import products from CSV</h2>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">
        Accepted file: .csv with header name,sku,description,category,price,stock,weight_kg. Maximum
        5 MiB and 10,000 records. Unexpected columns are rejected and nothing is imported when any
        record fails validation.
      </p>
      <form
        noValidate
        onSubmit={handleSubmit}
        className="mt-4 flex max-w-2xl flex-wrap items-end gap-3"
      >
        <div>
          <label htmlFor="csv-file" className="block text-sm font-medium text-slate-700">
            CSV file
          </label>
          <input
            id="csv-file"
            type="file"
            accept=".csv,text/csv"
            disabled={upload.isPending}
            onChange={(event) => {
              const selected = event.target.files?.[0] ?? null;
              setFile(selected);
              setSummary(null);
              setFailure(null);
              upload.reset();
            }}
            className="mt-1 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={file === null || upload.isPending}
          className="rounded bg-blue-700 px-4 py-1.5 text-sm text-white disabled:bg-slate-300"
        >
          {upload.isPending ? "Uploading…" : "Import"}
        </button>
        {(summary !== null || failure !== null) && (
          <button
            type="button"
            onClick={handleReset}
            className="rounded border border-slate-300 px-4 py-1.5 text-sm"
          >
            Choose another file
          </button>
        )}
      </form>

      {upload.isPending && (
        <p role="status" className="mt-3 text-sm text-slate-600">
          Uploading and validating…
        </p>
      )}
      {summary !== null && summary.errorCount === 0 && (
        <p role="status" className="mt-3 text-sm text-green-700">
          Created {summary.created} products from {summary.totalRecords} records.
        </p>
      )}
      {summary !== null && summary.errorCount > 0 && (
        <div className="mt-3 max-w-2xl">
          <p role="alert" className="text-sm text-red-700">
            Import rejected: {summary.errorCount} errors in {summary.totalRecords} records. Nothing
            was imported. Fix the file and try again.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {visibleErrors.map((error, index) => (
              <li key={`${error.record}-${error.field}-${error.code}-${index}`}>
                Record {error.record}, field {error.field === "" ? "file" : error.field} [
                {error.code}]: {error.message}
              </li>
            ))}
          </ul>
          {summary.errors.length < summary.errorCount && (
            <p className="mt-1 text-sm text-slate-600">
              Showing {summary.errors.length} of {summary.errorCount} errors.
            </p>
          )}
        </div>
      )}
      {failure !== null && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {failure}
        </p>
      )}

      <h3 className="mt-6 text-base font-semibold text-slate-900">Recently added products</h3>
      {catalog.isPending && (
        <p role="status" className="mt-1 text-sm text-slate-600">
          Loading products…
        </p>
      )}
      {catalog.isError && (
        <p role="alert" className="mt-1 text-sm text-red-700">
          Product list failed to load.
        </p>
      )}
      {catalog.data !== undefined && (
        <ul className="mt-2 max-w-2xl divide-y divide-slate-200 rounded border border-slate-200 bg-white text-sm">
          {catalog.data.data.map((item) => (
            <li key={item.id} className="flex justify-between gap-3 px-3 py-2">
              <span>
                {item.name} ({item.sku})
              </span>
              <span className="text-slate-600">
                {formatMoney(item.price)} · Stock {item.stock}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
