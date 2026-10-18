import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CartProvider } from "../cart/CartContext.js";
import { CatalogPage, emptyCatalogCopy } from "./CatalogPage.js";

const EMPTY_LIST = {
  data: [],
  pagination: { page: 1, pageSize: 12, totalItems: 0, totalPages: 0 },
};

const CATALOG_PRODUCT = {
  id: "66666666-6666-4666-8666-666666666666",
  name: "Trail Shoes",
  sku: "TS-001",
  price: "89.99",
  stock: 12,
  description: "Trail running shoes",
  category: "Footwear",
  weightKg: "0.350",
  createdAt: "2024-05-01T00:00:00.000Z",
  updatedAt: "2024-05-01T00:00:00.000Z",
  archivedAt: null,
};

function listBody(products: unknown[] = [], totalItems = products.length) {
  return JSON.stringify({
    data: products,
    pagination: { page: 1, pageSize: 12, totalItems, totalPages: totalItems === 0 ? 0 : 1 },
  });
}

function renderCatalog(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CartProvider>
        <MemoryRouter>
          <CatalogPage />
        </MemoryRouter>
      </CartProvider>
    </QueryClientProvider>,
  );
}

function listMock(): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify(EMPTY_LIST), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

function lastListUrl(fetchMock: ReturnType<typeof vi.fn>): string {
  const calls = fetchMock.mock.calls.filter((call) => String(call[0]).includes("/api/products"));
  return String(calls.at(-1)?.[0]);
}

describe("emptyCatalogCopy", () => {
  it("offers to clear the filters when the search excludes everything", () => {
    expect(emptyCatalogCopy(true, true)).toEqual({
      title: "No matching products",
      text: "Nothing matches the current search and filters.",
      action: "clear",
      actionLabel: "Clear filters",
    });
  });

  it("offers to reveal unavailable products when only the default stock filter is active", () => {
    expect(emptyCatalogCopy(false, true)).toEqual({
      title: "No products to show",
      text: "Every product is archived or out of stock. Reveal them to browse the full catalog.",
      action: "showUnavailable",
      actionLabel: "Show archived and out of stock",
    });
  });

  it("offers to create a product on an empty catalog with no filters", () => {
    expect(emptyCatalogCopy(false, false)).toEqual({
      title: "No products yet",
      text: "Create a product or import a CSV to fill the catalog.",
      action: "create",
      actionLabel: "Create your first product",
    });
  });
});

describe("CatalogPage", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("hides out-of-stock products by default and never shows archived ones", async () => {
    const fetchMock = listMock();
    renderCatalog(fetchMock);
    const inStockOnly = await screen.findByRole("checkbox", { name: "In stock only" });
    const includeArchived = screen.getByRole("checkbox", { name: "Include archived" });
    expect(inStockOnly).toBeChecked();
    expect(includeArchived).not.toBeChecked();

    await screen.findByText("No products to show");
    const url = lastListUrl(fetchMock);
    expect(url).toContain("inStock=true");
    expect(url).not.toContain("includeArchived");
  });

  it("stops filtering by stock when the toggle is cleared", async () => {
    const fetchMock = listMock();
    renderCatalog(fetchMock);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("checkbox", { name: "In stock only" }));

    await screen.findByRole("button", { name: "Create your first product" });
    expect(lastListUrl(fetchMock)).not.toContain("inStock");
  });

  it("reveals unavailable products from the empty state", async () => {
    const fetchMock = listMock();
    renderCatalog(fetchMock);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Show archived and out of stock" }));

    await screen.findByRole("button", { name: "Create your first product" });
    expect(screen.getByRole("checkbox", { name: "In stock only" })).not.toBeChecked();
  });

  it("asks for archived products only when that box is ticked", async () => {
    const fetchMock = listMock();
    renderCatalog(fetchMock);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("checkbox", { name: "Include archived" }));

    await screen.findByText("No matching products");
    expect(lastListUrl(fetchMock)).toContain("includeArchived=true");
    expect(lastListUrl(fetchMock)).toContain("inStock=true");
  });
});

describe("CatalogPage actions", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  function catalogMock(overrides: { body?: string } = {}) {
    return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "DELETE") {
        return Promise.resolve(
          new Response(
            JSON.stringify({ ...CATALOG_PRODUCT, archivedAt: "2024-06-01T00:00:00.000Z" }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          ),
        );
      }
      if (method === "POST" && url.endsWith("/api/products")) {
        return Promise.resolve(
          new Response(JSON.stringify(CATALOG_PRODUCT), {
            status: 201,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      if (method === "PATCH" || url.includes("/api/products/")) {
        return Promise.resolve(
          new Response(JSON.stringify(CATALOG_PRODUCT), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      return Promise.resolve(
        new Response(overrides.body ?? listBody([CATALOG_PRODUCT]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    });
  }

  it("opens the create modal from the header and reports the new product", async () => {
    const fetchMock = catalogMock();
    renderCatalog(fetchMock);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "New product" }));
    expect(screen.getByRole("dialog", { name: "New product" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Choose CSV file" })).toBeNull();
  });

  it("opens the import modal from the header", async () => {
    renderCatalog(catalogMock());
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Import CSV" }));
    expect(screen.getByRole("dialog", { name: "Import products from CSV" })).toBeVisible();
  });
});
