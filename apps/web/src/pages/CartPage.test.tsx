import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CartProvider } from "../cart/CartContext.js";
import { CartPage } from "./CartPage.js";

const STORAGE_KEY = "ecommerce-cart-v1";

const STORED_PRODUCT = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Retry Widget",
  sku: "RW-001",
  price: "10.00",
  stock: 5,
  description: "",
  category: "Tools",
  weightKg: "0.500",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  archivedAt: null,
};

const CREATED_ORDER = {
  id: "22222222-2222-4222-8222-222222222222",
  status: "PAID",
  paymentStatus: "SUCCEEDED",
  paymentReference: "fake_pay_1",
  total: "20.00",
  items: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      productId: STORED_PRODUCT.id,
      productName: "Retry Widget",
      productSku: "RW-001",
      unitPrice: "10.00",
      quantity: 2,
      lineTotal: "20.00",
    },
  ],
  createdAt: "2024-01-01T00:00:00.000Z",
};

function seedCart() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([{ product: STORED_PRODUCT, quantity: 2 }]));
}

function renderCart() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CartProvider>
        <MemoryRouter initialEntries={["/cart"]}>
          <Routes>
            <Route path="/cart" element={<CartPage />} />
            <Route path="/orders/:id" element={<p>Order detail page</p>} />
          </Routes>
        </MemoryRouter>
      </CartProvider>
    </QueryClientProvider>,
  );
}

describe("CartPage checkout", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("reuses the same idempotency key when retrying a failed network request", async () => {
    seedCart();
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith(`/api/products/${STORED_PRODUCT.id}`)) {
        return Promise.resolve(
          new Response(JSON.stringify(STORED_PRODUCT), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      if (url.endsWith("/api/orders") && init?.method === "POST") {
        const attempts = fetchMock.mock.calls.filter((call) =>
          String(call[0]).endsWith("/api/orders"),
        ).length;
        if (attempts === 1) {
          return Promise.reject(new Error("Connection reset"));
        }
        return Promise.resolve(
          new Response(JSON.stringify(CREATED_ORDER), {
            status: 201,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderCart();

    await user.click(await screen.findByRole("button", { name: "Place order" }));
    expect(await screen.findByText(/Retrying reuses the same idempotency key/)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Retry checkout" }));
    await waitFor(() => expect(screen.getByText("Order confirmed")).toBeVisible());
    expect(screen.getByRole("link", { name: "View order details" })).toHaveAttribute(
      "href",
      `/orders/${CREATED_ORDER.id}`,
    );

    const orderCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).endsWith("/api/orders"),
    );
    expect(orderCalls).toHaveLength(2);
    const firstHeaders = (orderCalls[0]?.[1] as { headers: Record<string, string> }).headers;
    const secondHeaders = (orderCalls[1]?.[1] as { headers: Record<string, string> }).headers;
    expect(firstHeaders["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(secondHeaders["idempotency-key"]).toBe(firstHeaders["idempotency-key"]);
  });

  it("shows payment failure distinctly without clearing the cart", async () => {
    seedCart();
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith(`/api/products/${STORED_PRODUCT.id}`)) {
        return Promise.resolve(
          new Response(JSON.stringify(STORED_PRODUCT), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ error: { code: "PAYMENT_DECLINED", message: "Declined" } }), {
          status: 402,
          headers: { "content-type": "application/json" },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderCart();
    await user.click(await screen.findByRole("button", { name: "Place order" }));
    expect(await screen.findByText(/Payment was declined/)).toBeVisible();
    expect(screen.getByText("Retry Widget")).toBeVisible();
  });
});
