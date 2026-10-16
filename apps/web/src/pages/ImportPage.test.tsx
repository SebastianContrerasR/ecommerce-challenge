import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ImportPage } from "./ImportPage.js";

function renderImport(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ImportPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const EMPTY_LIST = {
  data: [],
  pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
};

describe("ImportPage", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists structured errors with record and field, then recovers on retry", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith("/api/products/import") && init?.method === "POST") {
        const calls = fetchMock.mock.calls.filter((call) =>
          String(call[0]).endsWith("/api/products/import"),
        ).length;
        if (calls === 1) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                totalRecords: 2,
                validRecords: 1,
                errorCount: 1,
                created: 0,
                errors: [
                  { record: 2, field: "price", code: "INVALID_PRICE", message: "Bad price" },
                ],
              }),
              { status: 422, headers: { "content-type": "application/json" } },
            ),
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({
              totalRecords: 1,
              validRecords: 1,
              errorCount: 0,
              created: 1,
              errors: [],
            }),
            { status: 201, headers: { "content-type": "application/json" } },
          ),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify(EMPTY_LIST), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    });
    renderImport(fetchMock);
    const user = userEvent.setup();
    const badFile = new File(["name,sku\nbad"], "bad.csv", { type: "text/csv" });
    await user.upload(screen.getByLabelText("CSV file"), badFile);
    await user.click(screen.getByRole("button", { name: "Import" }));
    expect(await screen.findByText(/Record 2, field price/)).toBeVisible();

    const goodFile = new File(["name,sku\nok"], "good.csv", { type: "text/csv" });
    await user.upload(screen.getByLabelText("CSV file"), goodFile);
    await user.click(screen.getByRole("button", { name: "Import" }));
    expect(await screen.findByText("Created 1 products from 1 records.")).toBeVisible();
  });
});
