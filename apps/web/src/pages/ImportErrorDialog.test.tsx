import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ImportSummary } from "../api/import.js";
import {
  ImportErrorDialog,
  errorReportFileName,
  formatFieldLabel,
  formatRecordLabel,
  importRejectionMessage,
  sortImportErrors,
  toErrorCsv,
} from "./ImportErrorDialog.js";

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

const ONE_STOCK_ERROR: ImportSummary = makeSummary({
  totalRecords: 1,
  errorCount: 1,
  errors: [{ record: 1, field: "stock", code: "INVALID_STOCK", message: "Whole number expected" }],
});

function renderDialog(summary: ImportSummary) {
  const onClose = vi.fn();
  render(<ImportErrorDialog summary={summary} fileName="products.csv" onClose={onClose} />);
  return onClose;
}

describe("importRejectionMessage", () => {
  it("pluralizes errors and records and states that nothing was written", () => {
    expect(importRejectionMessage(1, 1)).toBe(
      "Import rejected: 1 error in 1 record. Nothing was imported.",
    );
    expect(importRejectionMessage(12, 40)).toBe(
      "Import rejected: 12 errors in 40 records. Nothing was imported.",
    );
  });
});

describe("formatRecordLabel", () => {
  it("names file-level problems as header problems", () => {
    expect(formatRecordLabel(0)).toBe("Header");
    expect(formatRecordLabel(7)).toBe("Record 7");
  });
});

describe("formatFieldLabel", () => {
  it("names the whole-file scope when no field is reported", () => {
    expect(formatFieldLabel("")).toBe("file");
    expect(formatFieldLabel("weight_kg")).toBe("weight_kg");
  });
});

describe("sortImportErrors", () => {
  it("orders rows by record with file-level problems first and keeps the input order otherwise", () => {
    expect(
      sortImportErrors([
        { record: 5, field: "sku", code: "DUPLICATE_SKU_IN_FILE", message: "later" },
        { record: 2, field: "name", code: "REQUIRED", message: "first" },
        { record: 0, field: "", code: "MISSING_HEADER", message: "header" },
        { record: 5, field: "stock", code: "INVALID_STOCK", message: "same record, later field" },
      ]).map((error) => `${error.record}:${error.field}`),
    ).toEqual(["0:", "2:name", "5:sku", "5:stock"]);
  });

  it("leaves the reported summary untouched", () => {
    const errors = [{ record: 3, field: "price", code: "INVALID_PRICE", message: "Bad" }];
    sortImportErrors(errors);
    expect(errors).toHaveLength(1);
  });
});

describe("toErrorCsv", () => {
  it("emits a spreadsheet-safe report with quoted separators and doubled quotes", () => {
    expect(
      toErrorCsv([
        { record: 0, field: "", code: "MISSING_HEADER", message: 'Expected "stock" column' },
        { record: 3, field: "price", code: "INVALID_PRICE", message: "Must be a decimal" },
      ]),
    ).toBe(
      'record,field,code,message\r\n0,file,MISSING_HEADER,"Expected ""stock"" column"\r\n3,price,INVALID_PRICE,Must be a decimal\r\n',
    );
  });

  it("writes only a header row when there are no errors", () => {
    expect(toErrorCsv([])).toBe("record,field,code,message\r\n");
  });
});

describe("errorReportFileName", () => {
  it("suffixes the source file name instead of replacing its extension", () => {
    expect(errorReportFileName("products.csv")).toBe("products-errors.csv");
    expect(errorReportFileName("archive.tar.gz")).toBe("archive.tar-errors.csv");
    expect(errorReportFileName("noextension")).toBe("noextension-errors.csv");
  });
});

describe("ImportErrorDialog", () => {
  it("presents the totals and one row per error with labels, codes, and reasons", () => {
    renderDialog(
      makeSummary({
        totalRecords: 2,
        validRecords: 1,
        errorCount: 1,
        errors: [
          { record: 2, field: "price", code: "INVALID_PRICE", message: "Must be a decimal" },
        ],
      }),
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveFocus();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("heading", { name: "Import rejected" })).toBeVisible();
    expect(
      screen.getByText(/Import rejected: 1 error in 2 records\. Nothing was imported\./),
    ).toBeVisible();
    expect(screen.getByText("Records").parentElement).toHaveTextContent("2");
    expect(screen.getByRole("cell", { name: "Record 2" })).toBeVisible();
    expect(screen.getByRole("cell", { name: "price" })).toBeVisible();
    expect(screen.getByRole("cell", { name: "INVALID_PRICE" })).toBeVisible();
    expect(screen.getByRole("cell", { name: "Must be a decimal" })).toBeVisible();
    expect(screen.getByText("1 error in products.csv.")).toBeVisible();
  });

  it("marks file-level problems as header problems", () => {
    renderDialog(
      makeSummary({
        errorCount: 1,
        errors: [{ record: 0, field: "", code: "MISSING_HEADER", message: "Missing stock" }],
      }),
    );
    expect(screen.getByRole("cell", { name: "Header" })).toBeVisible();
    expect(screen.getByRole("cell", { name: "file" })).toBeVisible();
  });

  it("orders rows by record so the report reads top to bottom", () => {
    renderDialog(
      makeSummary({
        totalRecords: 3,
        errorCount: 2,
        errors: [
          { record: 3, field: "sku", code: "DUPLICATE_SKU_IN_FILE", message: "Duplicate" },
          { record: 1, field: "price", code: "INVALID_PRICE", message: "Must be a decimal" },
        ],
      }),
    );
    const cells = screen.getAllByRole("cell").map((cell) => cell.textContent);
    expect(cells.slice(0, 4)).toEqual(["Record 1", "price", "INVALID_PRICE", "Must be a decimal"]);
  });

  it("reports how many of the counted errors are actually listed", () => {
    renderDialog(
      makeSummary({
        totalRecords: 500,
        errorCount: 250,
        errors: [
          { record: 1, field: "stock", code: "INVALID_STOCK", message: "Whole number expected" },
        ],
      }),
    );
    expect(screen.getByText("Showing 1 of 250 errors.")).toBeVisible();
  });

  it("dismisses on Escape", async () => {
    const onClose = renderDialog(ONE_STOCK_ERROR);
    await userEvent.setup().keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("dismisses from the footer button", async () => {
    const onClose = renderDialog(ONE_STOCK_ERROR);
    await userEvent.setup().click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("dismisses from the header icon", async () => {
    const onClose = renderDialog(ONE_STOCK_ERROR);
    await userEvent.setup().click(screen.getByRole("button", { name: "Close error details" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("dismisses when the backdrop is clicked", async () => {
    const onClose = renderDialog(ONE_STOCK_ERROR);
    const backdrop = screen.getByRole("dialog").parentElement?.firstElementChild;
    if (backdrop === null || backdrop === undefined) {
      throw new Error("expected a backdrop element next to the dialog");
    }
    await userEvent.setup().click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps Tab focus inside the dialog", async () => {
    const user = userEvent.setup();
    renderDialog(ONE_STOCK_ERROR);
    const close = screen.getByRole("button", { name: "Close" });
    close.focus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Close error details" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(close).toHaveFocus();
  });

  it("offers the full error report as a CSV download", async () => {
    const createObjectURL = vi.fn((_object: Blob | MediaSource) => "blob:mock");
    const revokeObjectURL = vi.fn((_url: string) => undefined);
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    try {
      renderDialog(
        makeSummary({
          errorCount: 1,
          errors: [
            { record: 2, field: "price", code: "INVALID_PRICE", message: "Must be a decimal" },
          ],
        }),
      );
      await userEvent.setup().click(screen.getByRole("button", { name: "Download errors.csv" }));
      expect(anchorClick).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");
      const blob = createObjectURL.mock.calls.at(0)?.at(0);
      expect(blob).toBeInstanceOf(Blob);
      const contents = blob instanceof Blob ? await blob.text() : "";
      expect(contents).toBe(
        "record,field,code,message\r\n2,price,INVALID_PRICE,Must be a decimal\r\n",
      );
    } finally {
      anchorClick.mockRestore();
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });
});
