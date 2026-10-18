import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportSummary } from "../api/import.js";
import { ImportModal } from "./ImportModal.js";

function makeSummary(overrides: Partial<ImportSummary> = {}): ImportSummary {
  return {
    totalRecords: 0,
    validRecords: 0,
    errorCount: 0,
    created: 0,
    errors: [],
    ...overrides,
  };
}

const CREATED_ONE = makeSummary({ totalRecords: 1, validRecords: 1, created: 1 });

const REJECTED_PRICE = makeSummary({
  totalRecords: 2,
  validRecords: 1,
  errorCount: 1,
  errors: [{ record: 2, field: "price", code: "INVALID_PRICE", message: "Bad price" }],
});

const REJECTED_STOCK = makeSummary({
  totalRecords: 1,
  errorCount: 1,
  errors: [{ record: 1, field: "stock", code: "INVALID_STOCK", message: "Whole number expected" }],
});

interface Rendered {
  onClose: ReturnType<typeof vi.fn>;
  onImported: ReturnType<typeof vi.fn>;
}

function renderImportModal(fetchMock: ReturnType<typeof vi.fn>): Rendered {
  vi.stubGlobal("fetch", fetchMock);
  const onClose = vi.fn();
  const onImported = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ImportModal onClose={onClose} onImported={onImported} />
    </QueryClientProvider>,
  );
  return { onClose, onImported };
}

function importResponse(summary: ImportSummary, status: number): Response {
  return new Response(JSON.stringify(summary), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function importCallCount(fetchMock: ReturnType<typeof vi.fn>): number {
  return fetchMock.mock.calls.filter((call) => String(call[0]).endsWith("/api/products/import"))
    .length;
}

interface UploadReply {
  summary: ImportSummary;
  status: number;
}

function uploadMock(replies: UploadReply[]) {
  let index = 0;
  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (url.endsWith("/api/products/import") && init?.method === "POST") {
      const reply = replies[index] ?? replies[index - 1] ?? { summary: CREATED_ONE, status: 201 };
      index += 1;
      return Promise.resolve(importResponse(reply.summary, reply.status));
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
}

function csvFile(name: string): File {
  return new File(["name,sku\nok"], name, { type: "text/csv" });
}

describe("ImportModal", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("offers a picker and no import action until a file is chosen", async () => {
    renderImportModal(uploadMock([{ summary: CREATED_ONE, status: 201 }]));
    const user = userEvent.setup();
    expect(screen.getByRole("button", { name: "Choose CSV file" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Import products" })).toBeNull();

    await user.upload(screen.getByLabelText("CSV file"), csvFile("products.csv"));
    expect(screen.getByText("products.csv")).toBeVisible();
    expect(screen.getByRole("button", { name: "Import products" })).toBeEnabled();
  });

  it("reports the created count to the catalog on success", async () => {
    const { onImported } = renderImportModal(
      uploadMock([
        { summary: makeSummary({ totalRecords: 3, validRecords: 3, created: 3 }), status: 201 },
      ]),
    );
    const user = userEvent.setup();
    await user.upload(screen.getByLabelText("CSV file"), csvFile("products.csv"));
    await user.click(screen.getByRole("button", { name: "Import products" }));
    expect(await screen.findByText("Created 3 products from 3 records.")).toBeVisible();
    expect(onImported).toHaveBeenCalledWith(3);
  });

  it("opens the error dialog on rejection and leaves a banner that reopens it", async () => {
    renderImportModal(uploadMock([{ summary: REJECTED_PRICE, status: 422 }]));
    const user = userEvent.setup();
    await user.upload(screen.getByLabelText("CSV file"), csvFile("bad.csv"));
    await user.click(screen.getByRole("button", { name: "Import products" }));

    const dialog = await screen.findByRole("dialog", { name: "Import rejected" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("heading", { name: "Import rejected" })).toBeVisible();
    expect(screen.getByRole("cell", { name: "Record 2" })).toBeVisible();
    expect(screen.getByRole("cell", { name: "price" })).toBeVisible();
    expect(screen.getByRole("cell", { name: "INVALID_PRICE" })).toBeVisible();
    expect(screen.getByRole("cell", { name: "Bad price" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("heading", { name: "Import rejected" })).toBeNull();
    expect(screen.getByRole("button", { name: "Import products" })).toHaveFocus();

    const banner = screen.getByRole("alert");
    expect(banner).toHaveTextContent(
      "Import rejected: 1 error in 2 records. Nothing was imported.",
    );
    await user.click(screen.getByRole("button", { name: "Review errors" }));
    expect(screen.getByRole("heading", { name: "Import rejected" })).toBeVisible();
  });

  it("closes the error dialog with Escape without closing the import modal", async () => {
    renderImportModal(uploadMock([{ summary: REJECTED_PRICE, status: 422 }]));
    const user = userEvent.setup();
    await user.upload(screen.getByLabelText("CSV file"), csvFile("bad.csv"));
    await user.click(screen.getByRole("button", { name: "Import products" }));
    expect(await screen.findByRole("heading", { name: "Import rejected" })).toBeVisible();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("heading", { name: "Import rejected" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Import products from CSV" })).toBeVisible();
  });

  it("recovers from a rejected file and imports the corrected one", async () => {
    const fetchMock = uploadMock([
      { summary: REJECTED_PRICE, status: 422 },
      { summary: CREATED_ONE, status: 201 },
    ]);
    renderImportModal(fetchMock);
    const user = userEvent.setup();
    await user.upload(screen.getByLabelText("CSV file"), csvFile("bad.csv"));
    await user.click(screen.getByRole("button", { name: "Import products" }));
    expect(await screen.findByRole("heading", { name: "Import rejected" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Close" }));

    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.queryByRole("button", { name: "Import products" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();

    await user.upload(screen.getByLabelText("CSV file"), csvFile("good.csv"));
    await user.click(screen.getByRole("button", { name: "Import products" }));
    expect(await screen.findByText("Created 1 product from 1 record.")).toBeVisible();
    expect(importCallCount(fetchMock)).toBe(2);
  });

  it("clears the file input on submit and on reset so the same file stays selectable", async () => {
    const fetchMock = uploadMock([
      { summary: CREATED_ONE, status: 201 },
      { summary: REJECTED_STOCK, status: 422 },
      { summary: CREATED_ONE, status: 201 },
    ]);
    renderImportModal(fetchMock);
    const user = userEvent.setup();
    const fileInput = screen.getByLabelText<HTMLInputElement>("CSV file");
    const sameFile = csvFile("same.csv");

    await user.upload(fileInput, sameFile);
    await user.click(screen.getByRole("button", { name: "Import products" }));
    expect(await screen.findByText("Created 1 product from 1 record.")).toBeVisible();
    expect(fileInput.files).toHaveLength(0);

    await user.upload(fileInput, sameFile);
    await user.click(screen.getByRole("button", { name: "Import products" }));
    expect(await screen.findByRole("heading", { name: "Import rejected" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Close error details" }));
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(fileInput.files).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Import products" })).toBeNull();

    await user.upload(fileInput, sameFile);
    await user.click(screen.getByRole("button", { name: "Import products" }));
    expect(importCallCount(fetchMock)).toBe(3);
  });

  it("surfaces transport failures inline without opening the dialog", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith("/api/products/import") && init?.method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({ error: { code: "FILE_TOO_LARGE", message: "File too large" } }),
            { status: 413, headers: { "content-type": "application/json" } },
          ),
        );
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    renderImportModal(fetchMock);
    const user = userEvent.setup();
    await user.upload(screen.getByLabelText("CSV file"), csvFile("huge.csv"));
    await user.click(screen.getByRole("button", { name: "Import products" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("File too large");
    expect(screen.queryByRole("heading", { name: "Import rejected" })).toBeNull();
  });

  it("closes on Escape without an upload", async () => {
    const { onClose } = renderImportModal(uploadMock([]));
    await userEvent.setup().keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
