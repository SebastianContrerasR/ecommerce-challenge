import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductFormPage } from "./ProductFormPage.js";

function renderCreate() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/products/new"]}>
        <Routes>
          <Route path="/products/new" element={<ProductFormPage mode="create" />} />
          <Route path="/products/:id" element={<p>Detail page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const VALID = {
  name: "Test Widget",
  sku: "TW-001",
  description: "A widget",
  category: "Tools",
  price: "19.99",
  stock: "7",
  weightKg: "0.500",
};

async function fillValidForm() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Name"), VALID.name);
  await user.type(screen.getByLabelText("SKU"), VALID.sku);
  await user.type(screen.getByLabelText("Description"), VALID.description);
  await user.type(screen.getByLabelText("Category"), VALID.category);
  await user.type(screen.getByLabelText("Price (USD)"), VALID.price);
  await user.clear(screen.getByLabelText("Stock"));
  await user.type(screen.getByLabelText("Stock"), VALID.stock);
  await user.type(screen.getByLabelText("Weight (kg)"), VALID.weightKg);
  return user;
}

describe("ProductFormPage", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows client-side errors without submitting", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderCreate();
    await user.click(screen.getByRole("button", { name: "Create product" }));
    expect(await screen.findByText("Name is required.")).toBeVisible();
    expect(screen.getByText("Price is required.")).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits valid input exactly once and navigates to detail", async () => {
    const created = {
      ...VALID,
      id: "product-1",
      price: "19.99",
      stock: 7,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
      archivedAt: null,
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(created), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderCreate();
    const user = await fillValidForm();
    await user.click(screen.getByRole("button", { name: "Create product" }));
    await waitFor(() => expect(screen.getByText("Detail page")).toBeVisible());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({ sku: "TW-001", stock: 7 });
  });

  it("maps duplicate SKU responses onto the SKU field", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "SKU_EXISTS", message: "Taken" } }), {
        status: 409,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderCreate();
    const user = await fillValidForm();
    await user.click(screen.getByRole("button", { name: "Create product" }));
    expect(await screen.findByText("This SKU is already in use.")).toBeVisible();
  });
});
