import type { ImportSummary } from "../api/import.js";
import { Modal } from "../components/Modal.js";

type ImportErrorDetail = ImportSummary["errors"][number];

interface ImportErrorDialogProps {
  summary: ImportSummary;
  fileName: string;
  onClose: () => void;
}

function plural(value: number, noun: string): string {
  return value === 1 ? `1 ${noun}` : `${value} ${noun}s`;
}

export function importRejectionMessage(errorCount: number, totalRecords: number): string {
  return `Import rejected: ${plural(errorCount, "error")} in ${plural(totalRecords, "record")}. Nothing was imported.`;
}

export function formatRecordLabel(record: number): string {
  return record === 0 ? "Header" : `Record ${record}`;
}

export function formatFieldLabel(field: string): string {
  return field === "" ? "file" : field;
}

export function sortImportErrors(errors: readonly ImportErrorDetail[]): ImportErrorDetail[] {
  return [...errors].sort((left, right) => left.record - right.record);
}

function escapeCsvValue(value: string): string {
  return /["\r\n,]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function toErrorCsv(errors: readonly ImportErrorDetail[]): string {
  const rows = errors.map((error) =>
    [String(error.record), formatFieldLabel(error.field), error.code, error.message]
      .map(escapeCsvValue)
      .join(","),
  );
  return `${[["record", "field", "code", "message"].join(","), ...rows].join("\r\n")}\r\n`;
}

export function errorReportFileName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const stem = dot <= 0 ? fileName : fileName.slice(0, dot);
  return `${stem}-errors.csv`;
}

function Stat({ label, value, emphasis }: { label: string; value: number; emphasis: boolean }) {
  return (
    <div className="bg-white px-5 py-3">
      <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</dt>
      <dd
        className={`mt-0.5 text-xl font-semibold ${emphasis ? "text-red-700" : "text-slate-900"}`}
      >
        {value}
      </dd>
    </div>
  );
}

export function ImportErrorDialog({ summary, fileName, onClose }: ImportErrorDialogProps) {
  function handleDownload(): void {
    const blob = new Blob([toErrorCsv(summary.errors)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = errorReportFileName(fileName);
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  const sortedErrors = sortImportErrors(summary.errors);
  const truncated = summary.errors.length < summary.errorCount;

  return (
    <Modal
      title="Import rejected"
      description={`${importRejectionMessage(summary.errorCount, summary.totalRecords)} Fix the file and try again.`}
      onClose={onClose}
      width="lg"
      closeLabel="Close error details"
      bodyClassName=""
      footer={
        <>
          <p className="mr-auto text-xs text-slate-500">
            {truncated
              ? `Showing ${summary.errors.length} of ${summary.errorCount} errors.`
              : `${plural(summary.errors.length, "error")} in ${fileName}.`}
          </p>
          <button type="button" onClick={handleDownload} className="btn btn-secondary">
            Download errors.csv
          </button>
          <button
            type="button"
            onClick={onClose}
            className="btn bg-slate-900 text-white hover:bg-slate-700"
          >
            Close
          </button>
        </>
      }
    >
      <dl className="grid grid-cols-2 gap-px border-b border-slate-200 bg-slate-200 sm:grid-cols-4">
        <Stat label="Records" value={summary.totalRecords} emphasis={false} />
        <Stat label="Valid" value={summary.validRecords} emphasis={false} />
        <Stat label="Errors" value={summary.errorCount} emphasis />
        <Stat label="Created" value={summary.created} emphasis={false} />
      </dl>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">Validation errors found in {fileName}</caption>
          <thead className="sticky top-0 bg-slate-50">
            <tr className="border-b border-slate-200">
              <th
                scope="col"
                className="px-5 py-2.5 text-xs font-semibold tracking-wide text-slate-600 uppercase"
              >
                Record
              </th>
              <th
                scope="col"
                className="px-5 py-2.5 text-xs font-semibold tracking-wide text-slate-600 uppercase"
              >
                Field
              </th>
              <th
                scope="col"
                className="px-5 py-2.5 text-xs font-semibold tracking-wide text-slate-600 uppercase"
              >
                Problem
              </th>
              <th
                scope="col"
                className="px-5 py-2.5 text-xs font-semibold tracking-wide text-slate-600 uppercase"
              >
                Reason
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedErrors.map((error, index) => (
              <tr
                key={`${error.record}-${error.field}-${error.code}-${index}`}
                className="align-top"
              >
                <td className="px-5 py-2.5 font-medium whitespace-nowrap text-slate-900">
                  {formatRecordLabel(error.record)}
                </td>
                <td className="px-5 py-2.5 whitespace-nowrap text-slate-900">
                  {formatFieldLabel(error.field)}
                </td>
                <td className="px-5 py-2.5 whitespace-nowrap">
                  <span className="badge badge-danger">{error.code}</span>
                </td>
                <td className="px-5 py-2.5 text-red-700">{error.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
