import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { getApiBaseUrl } from "../api/client.js";
import { importProductsCsv } from "../api/import.js";
import type { ImportSummary } from "../api/import.js";
import { formatBytes } from "../format.js";
import { ImportErrorDialog, importRejectionMessage } from "../pages/ImportErrorDialog.js";
import { UploadIcon } from "./icons.js";
import { Modal } from "./Modal.js";

function plural(value: number, noun: string): string {
  return value === 1 ? `1 ${noun}` : `${value} ${noun}s`;
}

interface ImportModalProps {
  onClose: () => void;
  onImported: (created: number) => void;
}

export function ImportModal({ onClose, onImported }: ImportModalProps) {
  const [apiBaseUrl] = useState<string>(() => getApiBaseUrl());
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [errorsOpen, setErrorsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const upload = useMutation({
    mutationFn: (selected: File) => importProductsCsv(apiBaseUrl, selected),
    onSuccess: (result) => {
      setFailure(null);
      setSummary(result);
      setErrorsOpen(result.errorCount > 0);
      if (result.errorCount === 0) {
        onImported(result.created);
      }
    },
    onError: (error) => {
      setSummary(null);
      setErrorsOpen(false);
      setFailure(error instanceof Error ? error.message : "Import failed.");
    },
  });

  function clearSelectedFileInput(): void {
    if (fileInputRef.current !== null) {
      fileInputRef.current.value = "";
    }
  }

  function clearResult(): void {
    setSummary(null);
    setFailure(null);
    setErrorsOpen(false);
  }

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault();
    if (file === null || upload.isPending) {
      return;
    }
    clearSelectedFileInput();
    upload.mutate(file);
  }

  function handleReset(): void {
    clearSelectedFileInput();
    setFile(null);
    clearResult();
    upload.reset();
  }

  return (
    <>
      <Modal
        title="Import products from CSV"
        description="Accepted file: .csv with header name,sku,description,category,price,stock,weight_kg. Maximum 5 MiB and 10,000 records. Nothing is imported when any record fails validation."
        onClose={onClose}
        width="md"
        closeLabel="Close import dialog"
      >
        <form noValidate onSubmit={handleSubmit}>
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="csv-file" className="text-sm font-medium text-slate-700">
              CSV file
            </label>
            <input
              id="csv-file"
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              disabled={upload.isPending}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                clearResult();
                upload.reset();
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={upload.isPending}
              className="btn btn-secondary"
            >
              Choose CSV file
            </button>
          </div>

          {file !== null && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{file.name}</p>
                <p className="text-xs text-slate-500">{formatBytes(file.size)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={upload.isPending}
                  className="btn btn-secondary"
                >
                  Remove
                </button>
                <button
                  type="submit"
                  aria-label="Import products"
                  disabled={upload.isPending}
                  className="btn btn-primary"
                >
                  <UploadIcon />
                  <span className="btn-label">
                    {upload.isPending ? "Uploading…" : "Import products"}
                  </span>
                </button>
              </div>
            </div>
          )}
        </form>

        {upload.isPending && (
          <p role="status" className="mt-4 text-sm text-slate-600">
            Uploading and validating…
          </p>
        )}
        {summary !== null && summary.errorCount === 0 && (
          <p role="status" className="alert alert-success mt-4">
            Created {plural(summary.created, "product")} from{" "}
            {plural(summary.totalRecords, "record")}.
          </p>
        )}
        {summary !== null && summary.errorCount > 0 && !errorsOpen && (
          <div className="alert alert-error mt-4">
            <p role="alert">
              {importRejectionMessage(summary.errorCount, summary.totalRecords)} Fix the file and
              try again.
            </p>
            <button
              type="button"
              onClick={() => setErrorsOpen(true)}
              className="btn btn-secondary mt-3 border-red-300 text-red-800"
            >
              Review errors
            </button>
          </div>
        )}
        {failure !== null && (
          <p role="alert" className="alert alert-error mt-4">
            {failure}
          </p>
        )}
      </Modal>

      {summary !== null && summary.errorCount > 0 && errorsOpen && (
        <ImportErrorDialog
          summary={summary}
          fileName={file?.name ?? "the selected file"}
          onClose={() => setErrorsOpen(false)}
        />
      )}
    </>
  );
}
