import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ProductFormModal,
  validateProductForm,
  visibleProductFormErrors,
} from "./ProductFormModal.js";
import type { FormValues } from "./ProductFormModal.js";

const EXISTING = {
  id: "55555555-5555-4555-8555-555555555555",
  name: "Existing Widget",
  sku: "EX-001",
  price: "12.00",
  stock: 4,
  description: "Already in the catalog",
  category: "Tools",
  weightKg: "0.400",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  archivedAt: null,
};

function renderModal(
  props: { mode: "create" | "edit"; productId?: string },
  fetchMock: ReturnType<typeof vi.fn>,
) {
  vi.stubGlobal("fetch", fetchMock);
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ProductFormModal
        mode={props.mode}
        productId={props.productId}
        onClose={onClose}
        onSaved={onSaved}
      />
    </QueryClientProvider>,
  );
  return { onClose, onSaved };
}

function productResponse(product: unknown, status: number): Response {
  return new Response(JSON.stringify(product), {
    status,
    headers: { "content-type": "application/json" },
  });
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

describe("validateProductForm", () => {
  it("rejects empty and malformed values", () => {
    const errors = validateProductForm({
      name: " ",
      sku: "",
      description: "x".repeat(2001),
      category: "",
      price: "free",
      stock: "-1",
      weightKg: "0.12345",
    });
    expect(Object.keys(errors).sort()).toEqual([
      "category",
      "description",
      "name",
      "price",
      "sku",
      "stock",
      "weightKg",
    ]);
  });

  it("accepts a well-formed product", () => {
    expect(
      validateProductForm({
        name: "Widget",
        sku: "TW-1",
        description: "",
        category: "Tools",
        price: "0.05",
        stock: "0",
        weightKg: "0.350",
      }),
    ).toEqual({});
  });
});

describe("visibleProductFormErrors", () => {
  const emptyValues: FormValues = {
    name: "",
    sku: "",
    description: "",
    category: "",
    price: "",
    stock: "",
    weightKg: "",
  };

  it("stays quiet until a field is touched or a submit is attempted", () => {
    expect(
      visibleProductFormErrors({
        values: emptyValues,
        touched: [],
        submitAttempted: false,
        skuError: undefined,
        formError: undefined,
      }),
    ).toEqual({});
  });

  it("reports only the touched fields while typing", () => {
    const errors = visibleProductFormErrors({
      values: { ...emptyValues, name: "Widget", price: "1.234" },
      touched: ["name", "price"],
      submitAttempted: false,
      skuError: undefined,
      formError: undefined,
    });
    expect(Object.keys(errors)).toEqual(["price"]);
    expect(errors.price).toBe("Price must be a nonnegative amount with at most two decimals.");
  });

  it("reports every field once a submit has been attempted", () => {
    const errors = visibleProductFormErrors({
      values: emptyValues,
      touched: ["name"],
      submitAttempted: true,
      skuError: undefined,
      formError: undefined,
    });
    expect(Object.keys(errors).sort()).toEqual([
      "category",
      "name",
      "price",
      "sku",
      "stock",
      "weightKg",
    ]);
  });

  it("keeps a server error that outranks live validation of the same field", () => {
    const errors = visibleProductFormErrors({
      values: { ...emptyValues, sku: "" },
      touched: ["sku"],
      submitAttempted: true,
      skuError: "This SKU is already in use.",
      formError: "Save failed.",
    });
    expect(errors.sku).toBe("This SKU is already in use.");
    expect(errors.form).toBe("Save failed.");
  });
});

describe("ProductFormModal", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows client-side errors without submitting and focuses the first bad field", async () => {
    const fetchMock = vi.fn();
    const { onSaved } = renderModal({ mode: "create" }, fetchMock);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Create product" }));
    expect(await screen.findByText("Name is required.")).toBeVisible();
    expect(screen.getByText("Price is required.")).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Name")).toHaveFocus();
  });

  it("does not shout at an untouched form", () => {
    renderModal({ mode: "create" }, vi.fn());
    expect(screen.queryByText("Name is required.")).toBeNull();
    expect(screen.queryByText("SKU is required.")).toBeNull();
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByLabelText("Price (USD)")).toHaveAccessibleDescription("Example 19.99.");
  });

  it("validates while typing and clears the message once the value is valid", async () => {
    const fetchMock = vi.fn();
    renderModal({ mode: "create" }, fetchMock);
    const user = userEvent.setup();
    const price = screen.getByLabelText("Price (USD)");

    await user.type(price, "19.999");
    expect(
      await screen.findByText("Price must be a nonnegative amount with at most two decimals."),
    ).toBeVisible();
    expect(price).toHaveAttribute("aria-invalid", "true");
    expect(price).toHaveAccessibleDescription(
      "Price must be a nonnegative amount with at most two decimals.Example 19.99.",
    );
    expect(fetchMock).not.toHaveBeenCalled();

    await user.clear(price);
    expect(screen.getByText("Price is required.")).toBeVisible();
    await user.type(price, "19.99");
    expect(screen.queryByText("Price is required.")).toBeNull();
    expect(price).toHaveAttribute("aria-invalid", "false");
  });

  it("validates a field the user touched without flagging the rest", async () => {
    renderModal({ mode: "create" }, vi.fn());
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Name"), " ");
    expect(screen.getByText("Name is required.")).toBeVisible();
    expect(screen.queryByText("SKU is required.")).toBeNull();
    expect(screen.queryByText("Category is required.")).toBeNull();
  });

  it("pairs fields on wider screens and stacks them on narrow ones", () => {
    renderModal({ mode: "create" }, vi.fn());
    const form = document.getElementById("product-form");
    expect(form?.className).toContain("sm:grid-cols-2");

    const cell = (label: string) => screen.getByText(label, { selector: "label" }).closest("div");
    const paired = ["Name", "SKU", "Category", "Price", "Stock", "Weight"];
    for (const label of paired) {
      expect(cell(label)?.className ?? "").not.toContain("col-span-2");
    }
    expect(cell("Description")?.className).toBe("sm:col-span-2");

    const order = [...(form?.children ?? [])].map(
      (node) => node.querySelector("label")?.firstChild?.textContent ?? "",
    );
    expect(order).toEqual(["Name", "SKU", "Description", "Category", "Price", "Stock", "Weight"]);
  });

  it("puts the units inside the price and weight inputs", () => {
    renderModal({ mode: "create" }, vi.fn());
    const price = screen.getByLabelText("Price (USD)");
    const weight = screen.getByLabelText("Weight (kg)");

    for (const [input, suffixText] of [
      [price, "USD"],
      [weight, "kg"],
    ] as const) {
      const wrapper = input.closest("[data-field]");
      const suffix = wrapper?.querySelector(".input-suffix");
      expect(suffix?.textContent).toBe(suffixText);
      expect(suffix).toHaveAttribute("aria-hidden", "true");
      expect(input.className).toContain("input-has-suffix");
    }

    expect(
      screen.getByText("Price", { selector: "label" }).querySelector(".sr-only")?.textContent,
    ).toBe(" (USD)");
    expect(
      screen.getByText("Weight", { selector: "label" }).querySelector(".sr-only")?.textContent,
    ).toBe(" (kg)");
    expect(
      screen.getByLabelText("Name").closest("[data-field]")?.querySelector(".input-suffix"),
    ).toBeNull();
  });

  it("shows icons on the actions while keeping their accessible names", () => {
    renderModal({ mode: "create" }, vi.fn());
    const submit = screen.getByRole("button", { name: "Create product" });
    expect(submit.getAttribute("aria-label")).toBe("Create product");
    expect(submit.querySelector("svg")).not.toBeNull();
    expect(submit.querySelector(".btn-label")?.textContent).toBe("Create product");

    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(cancel.getAttribute("aria-label")).toBe("Cancel");
    expect(cancel.querySelector("svg")).not.toBeNull();
    expect(cancel.querySelector(".btn-label")?.textContent).toBe("Cancel");
  });

  it("posts a valid product exactly once and hands it back", async () => {
    const created = {
      ...EXISTING,
      id: "product-1",
      name: VALID.name,
      sku: VALID.sku,
      price: "19.99",
      stock: 7,
    };
    const fetchMock = vi.fn().mockResolvedValue(productResponse(created, 201));
    const { onSaved } = renderModal({ mode: "create" }, fetchMock);
    const user = await fillValidForm();
    await user.click(screen.getByRole("button", { name: "Create product" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({ sku: "TW-001", stock: 7 });
  });

  it("maps duplicate SKU responses onto the SKU field", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(productResponse({ error: { code: "SKU_EXISTS", message: "Taken" } }, 409));
    renderModal({ mode: "create" }, fetchMock);
    const user = await fillValidForm();
    await user.click(screen.getByRole("button", { name: "Create product" }));
    expect(await screen.findByText("This SKU is already in use.")).toBeVisible();
    expect(screen.getByLabelText("SKU")).toHaveFocus();
  });

  it("drops the duplicate SKU message once the SKU is edited", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(productResponse({ error: { code: "SKU_EXISTS", message: "Taken" } }, 409));
    renderModal({ mode: "create" }, fetchMock);
    const user = await fillValidForm();
    await user.click(screen.getByRole("button", { name: "Create product" }));
    expect(await screen.findByText("This SKU is already in use.")).toBeVisible();
    await user.type(screen.getByLabelText("SKU"), "-2");
    expect(screen.queryByText("This SKU is already in use.")).toBeNull();
    expect(screen.getByLabelText("SKU")).toHaveAttribute("aria-invalid", "false");
  });

  it("loads the product and patches it on save", async () => {
    const updated = { ...EXISTING, price: "15.50" };
    const fetchMock = vi
      .fn()
      .mockImplementation((url: string, init?: RequestInit) =>
        init?.method === "PATCH"
          ? Promise.resolve(productResponse(updated, 200))
          : Promise.resolve(productResponse(EXISTING, 200)),
      );
    const { onSaved } = renderModal({ mode: "edit", productId: EXISTING.id }, fetchMock);

    expect(await screen.findByDisplayValue(EXISTING.name)).toBeVisible();
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("Price (USD)"));
    await user.type(screen.getByLabelText("Price (USD)"), "15.50");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(updated));
    const patchCall = fetchMock.mock.calls.find((call) => {
      const init = call[1] as RequestInit | undefined;
      return init?.method === "PATCH";
    });
    expect(patchCall).toBeDefined();
    expect(String(patchCall?.[0])).toContain(`/api/products/${EXISTING.id}`);
  });

  it("reports a failed load without submitting anything", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(productResponse({ error: { code: "PRODUCT_NOT_FOUND" } }, 404));
    renderModal({ mode: "edit", productId: EXISTING.id }, fetchMock);
    expect(await screen.findByText("Product failed to load.")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape and on Cancel", async () => {
    const { onClose } = renderModal({ mode: "create" }, vi.fn());
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
