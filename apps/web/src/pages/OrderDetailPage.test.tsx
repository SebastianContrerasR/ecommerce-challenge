import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrderDetailPage, paymentTone } from "./OrderDetailPage.js";

function buildItems(count: number) {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `8888888${index}-8888-4888-8888-88888888888${index}`,
    productId: `99999999-9999-4999-8999-99999999999${index % 10}`,
    productName: `Line item ${index + 1}`,
    productSku: `SKU-${index + 1}`,
    unitPrice: "10.00",
    quantity: 1,
    lineTotal: "10.00",
  }));
}

const ORDER = {
  id: "77777777-7777-4777-8777-777777777777",
  status: "PAID",
  paymentStatus: "SUCCEEDED",
  paymentReference: "fake_pay_42",
  total: "39.98",
  items: [
    {
      id: "88888888-8888-4888-8888-888888888888",
      productId: "99999999-9999-4999-8999-999999999999",
      productName: "Trail Shoes",
      productSku: "TS-001",
      unitPrice: "89.99",
      quantity: 2,
      lineTotal: "179.98",
    },
  ],
  createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
};

function renderOrder(body: unknown = ORDER, status = 200, path = `/orders/${ORDER.id}`) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        }),
      ),
    ),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/orders/:id" element={<OrderDetailPage />} />
          <Route path="/" element={<p>Catalog landing</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("paymentTone", () => {
  it("marks settled money green, anything in flight amber, and the rest neutral", () => {
    expect(paymentTone("PAID")).toBe("success");
    expect(paymentTone("SUCCEEDED")).toBe("success");
    expect(paymentTone("DECLINED")).toBe("warning");
    expect(paymentTone("SOMETHING_ELSE")).toBe("neutral");
  });
});

describe("OrderDetailPage", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the same wide column as the product detail page", async () => {
    renderOrder();
    expect(await screen.findByRole("heading", { name: `Order ${ORDER.id}` })).toBeVisible();
    const column = screen.getByRole("region", { name: "Order detail" });
    expect(column.className).toContain("mx-auto");
    expect(column.className).not.toContain("max-w-");
  });

  it("colours the status and payment badges", async () => {
    renderOrder();
    const status = await screen.findByText("PAID");
    const payment = screen.getByText("SUCCEEDED");
    expect(status.className).toContain("badge-success");
    expect(payment.className).toContain("badge-success");
  });

  it("shows a relative timestamp and exposes the absolute one as a described tooltip", async () => {
    renderOrder();
    const placed = await screen.findByText("5 minutes ago");
    expect(placed.tagName).toBe("TIME");
    expect(placed).toHaveAttribute("datetime", ORDER.createdAt);
    expect(placed).toHaveAttribute("tabindex", "0");

    const tooltip = screen.getByRole("tooltip");
    expect(placed).toHaveAttribute("aria-describedby", tooltip.id);
    expect(tooltip.className).toBe("tooltip");
    expect(tooltip.textContent).not.toBe("");
    expect(tooltip.textContent).not.toBe(ORDER.createdAt);
  });

  it("types the total row like the rest of the summary", async () => {
    renderOrder();
    const orderIdLabel = await screen.findByText("Order id");
    const totalLabel = screen.getByText("Total charged");
    expect(orderIdLabel.className).toBe("font-medium text-slate-600");
    expect(orderIdLabel.parentElement?.className).toContain("definition-list");
    expect(totalLabel.className).toBe("text-sm font-medium text-slate-600");
    expect(screen.getByText("$39.98").className).toBe("text-sm text-slate-900");
  });

  it("keeps the total inside the summary card, ahead of the items card", async () => {
    renderOrder();
    await screen.findByRole("heading", { name: "Summary" });
    const itemsHeading = screen.getByRole("heading", { name: "Items" });
    const grid = screen.getByRole("heading", { name: "Summary" }).closest("div.grid");
    const cards = Array.from(grid?.children ?? []);

    const total = screen.getByText("Total charged");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toContainElement(total);
    expect(cards[0]).toContainElement(screen.getByText("PAID"));
    expect(cards[1]).toContainElement(itemsHeading);
    expect(cards[0]).toContainElement(screen.getByText("$39.98"));
  });

  it("names the payment fields and exposes the order and payment ids in the summary", async () => {
    renderOrder();
    const summaryCard = (await screen.findByRole("heading", { name: "Summary" })).parentElement;
    expect(summaryCard).not.toBeNull();
    expect(summaryCard).toContainElement(screen.getByText("Order id"));
    expect(summaryCard).toContainElement(screen.getByText("Payment status"));
    expect(summaryCard).toContainElement(screen.getByText("Payment id"));
    expect(summaryCard).toContainElement(screen.getByText(ORDER.id));
    expect(summaryCard).toContainElement(screen.getByText(ORDER.paymentReference));
    expect(screen.queryByText("Payment")).toBeNull();
  });

  it("keeps the page header to the title alone", async () => {
    renderOrder();
    const heading = await screen.findByRole("heading", { name: `Order ${ORDER.id}` });
    const headerBlock = heading.parentElement?.parentElement;
    expect(headerBlock).toContainElement(heading);
    expect(headerBlock?.querySelectorAll("p")).toHaveLength(0);
  });

  it("shows the first ten items and a show-more control only when items are hidden", async () => {
    renderOrder({ ...ORDER, items: buildItems(23) });
    await screen.findByRole("heading", { name: "Items" });
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    expect(screen.getByText("Showing 10 of 23")).toBeVisible();

    const showMore = screen.getByRole("button", { name: "Show more (13 remaining)" });
    await userEvent.setup().click(showMore);
    expect(screen.getAllByRole("listitem")).toHaveLength(20);
    expect(screen.getByText("Showing 20 of 23")).toBeVisible();

    await userEvent.setup().click(screen.getByRole("button", { name: "Show more (3 remaining)" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(23);
    expect(screen.queryByRole("button", { name: /Show more/ })).toBeNull();
    expect(screen.queryByText(/Showing \d+ of/)).toBeNull();
  });

  it("omits the show-more control for short orders", async () => {
    renderOrder({ ...ORDER, items: buildItems(10) });
    await screen.findByRole("heading", { name: "Items" });
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    expect(screen.queryByRole("button", { name: /Show more/ })).toBeNull();
  });

  it("links back to the catalog the same way the product detail page does", async () => {
    renderOrder();
    const back = await screen.findByRole("link", { name: "← Back to catalog" });
    expect(back).toHaveAttribute("href", "/");
    expect(back.className).toContain("text-blue-700");
  });

  it("reports a missing order with the same back link", async () => {
    renderOrder({ error: { code: "ORDER_NOT_FOUND", message: "Order not found: x" } }, 404);
    expect(await screen.findByRole("alert")).toHaveTextContent("Order not found.");
    expect(screen.getByRole("link", { name: "← Back to catalog" })).toHaveAttribute("href", "/");
  });

  it("sends a non-uuid path back to the catalog", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.reject(new Error("unused"))),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/orders/latest"]}>
          <Routes>
            <Route path="/orders/:id" element={<OrderDetailPage />} />
            <Route path="/" element={<p>Catalog landing</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Catalog landing")).toBeVisible();
  });
});
