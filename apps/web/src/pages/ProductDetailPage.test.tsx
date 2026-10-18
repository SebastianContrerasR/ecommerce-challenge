import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductDetailPage } from "./ProductDetailPage.js";

const PRODUCT = {
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

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderDetail(fetchMock: ReturnType<typeof vi.fn>, path = `/products/${PRODUCT.id}`) {
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/products/:id" element={<ProductDetailPage />} />
          <Route path="/" element={<p>Catalog landing</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function productMock(overrides: { archive?: () => Response } = {}) {
  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "DELETE") {
      return Promise.resolve(
        overrides.archive?.() ??
          jsonResponse({ ...PRODUCT, archivedAt: "2024-06-01T00:00:00.000Z" }, 200),
      );
    }
    if (method === "PATCH") {
      return Promise.resolve(jsonResponse({ ...PRODUCT, price: "79.99" }, 200));
    }
    return Promise.resolve(jsonResponse(PRODUCT, 200));
  });
}

describe("ProductDetailPage", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("centers the content like the catalog and keeps editing out of the buy flow", async () => {
    renderDetail(productMock());
    expect(await screen.findByRole("heading", { name: PRODUCT.name })).toBeVisible();
    const column = screen.getByRole("region", { name: "Product detail" });
    expect(column.className).toContain("mx-auto");
    expect(column.className).toContain("w-full");
    expect(column.className).not.toContain("max-w-");
    expect(screen.queryByRole("button", { name: "Add to cart" })).toBeNull();
    expect(screen.queryByText("Add it to the cart from the catalog to order it.")).toBeNull();
  });

  it("puts edit and archive next to the title", async () => {
    renderDetail(productMock());
    await screen.findByRole("heading", { name: PRODUCT.name });
    const titleRow = screen.getByRole("heading", { name: PRODUCT.name }).parentElement
      ?.parentElement;
    expect(titleRow).toContainElement(screen.getByRole("button", { name: "Edit" }));
    expect(titleRow).toContainElement(screen.getByRole("button", { name: "Archive" }));
  });

  it("opens the edit modal prefilled and patches on save", async () => {
    const fetchMock = productMock();
    renderDetail(fetchMock);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Edit" }));

    const dialog = await screen.findByRole("dialog", { name: "Edit product" });
    expect(dialog).toBeVisible();
    expect(screen.getByLabelText("Name")).toHaveValue(PRODUCT.name);
    await user.clear(screen.getByLabelText("Price (USD)"));
    await user.type(screen.getByLabelText("Price (USD)"), "79.99");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(screen.getByText(`Updated ${PRODUCT.name}.`)).toBeVisible());
    expect(screen.queryByRole("dialog")).toBeNull();
    const patchCall = fetchMock.mock.calls.find(
      (call) => (call[1] as RequestInit | undefined)?.method === "PATCH",
    );
    expect(patchCall).toBeDefined();
  });

  it("archives only after the confirmation modal is accepted", async () => {
    const fetchMock = productMock();
    renderDetail(fetchMock);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Archive" }));

    const dialog = await screen.findByRole("dialog", { name: `Archive ${PRODUCT.name}?` });
    expect(dialog).toBeVisible();
    expect(
      fetchMock.mock.calls.filter(
        (call) => (call[1] as RequestInit | undefined)?.method === "DELETE",
      ),
    ).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Confirm archive" }));
    await waitFor(() => expect(screen.getByText("Product archived.")).toBeVisible());
    const deleteCall = fetchMock.mock.calls.find(
      (call) => (call[1] as RequestInit | undefined)?.method === "DELETE",
    );
    expect(String(deleteCall?.[0])).toContain(`/api/products/${PRODUCT.id}`);
  });

  it("cancels or escapes the archive confirmation without calling the API", async () => {
    const fetchMock = productMock();
    renderDetail(fetchMock);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Archive" }));
    await screen.findByRole("dialog", { name: `Archive ${PRODUCT.name}?` });

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      fetchMock.mock.calls.filter(
        (call) => (call[1] as RequestInit | undefined)?.method === "DELETE",
      ),
    ).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Archive" }));
    await screen.findByRole("dialog", { name: `Archive ${PRODUCT.name}?` });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      fetchMock.mock.calls.filter(
        (call) => (call[1] as RequestInit | undefined)?.method === "DELETE",
      ),
    ).toHaveLength(0);
  });

  it("reports a failed archive inside the confirmation modal", async () => {
    const fetchMock = productMock({
      archive: () => jsonResponse({ error: { code: "PRODUCT_ARCHIVED", message: "Gone" } }, 409),
    });
    renderDetail(fetchMock);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Archive" }));
    await user.click(await screen.findByRole("button", { name: "Confirm archive" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This product is already archived.");
    expect(screen.getByRole("dialog", { name: `Archive ${PRODUCT.name}?` })).toBeVisible();
  });

  it("hides the archive action and explains itself for archived products", async () => {
    const archived = { ...PRODUCT, archivedAt: "2024-06-01T00:00:00.000Z" };
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(jsonResponse(archived, 200)));
    renderDetail(fetchMock);
    expect(await screen.findByText("Archived")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.getByRole("link", { name: "Browse catalog" })).toHaveAttribute("href", "/");
    expect(
      screen.getByText(
        "This product is archived: it stays in order history but cannot be purchased or edited.",
      ),
    ).toBeVisible();
  });

  it("sends a non-uuid path back to the catalog", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.reject(new Error("unused")));
    renderDetail(fetchMock, "/products/new");
    expect(await screen.findByText("Catalog landing")).toBeVisible();
  });

  it("explains a missing product instead of rendering a broken page", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          jsonResponse(
            { error: { code: "PRODUCT_NOT_FOUND", message: "Product not found: missing" } },
            404,
          ),
        ),
      );
    renderDetail(fetchMock);
    expect(await screen.findByRole("alert")).toHaveTextContent("Product not found.");
    expect(screen.getByRole("link", { name: "Back to catalog" })).toHaveAttribute("href", "/");
  });
});
