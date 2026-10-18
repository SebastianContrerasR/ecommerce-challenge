import { test, expect } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

const API_URL = process.env["E2E_API_URL"] ?? "http://localhost:3000";

async function createProduct(
  request: APIRequestContext,
  overrides: Record<string, unknown>,
): Promise<{ id: string }> {
  const response = await request.post(`${API_URL}/api/products`, {
    data: {
      name: "E2E Product",
      sku: `E2E-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      description: "Created for catalog tests",
      category: "E2E",
      price: "15.00",
      stock: 10,
      weightKg: "0.500",
      ...overrides,
    },
  });
  if (!response.ok()) {
    throw new Error(`Setup failed with status ${response.status()}`);
  }
  return (await response.json()) as { id: string };
}

async function fillProductForm(page: Page, values: Record<string, string>) {
  const dialog = page.getByRole("dialog", { name: /New product|Edit product/ });
  await dialog.getByLabel("Name").fill(values["name"] ?? "");
  await dialog.getByLabel("SKU").fill(values["sku"] ?? "");
  await dialog.getByLabel("Description").fill(values["description"] ?? "");
  await dialog.getByLabel("Category").fill(values["category"] ?? "");
  await dialog.getByLabel("Price (USD)").fill(values["price"] ?? "");
  await dialog.getByLabel("Stock").fill(values["stock"] ?? "");
  await dialog.getByLabel("Weight (kg)").fill(values["weightKg"] ?? "");
}

test("create a product and find it using search", async ({ page }) => {
  const stamp = Date.now();
  const sku = `E2E-P-${stamp}`;
  await page.goto("/");
  await page.getByRole("button", { name: "New product" }).click();
  await expect(page.getByRole("dialog", { name: "New product" })).toBeVisible();
  await fillProductForm(page, {
    name: `E2E Searchable ${stamp}`,
    sku,
    description: "Created through the UI",
    category: "E2E",
    price: "42.50",
    stock: "8",
    weightKg: "1.250",
  });
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page.getByText(`Created E2E Searchable ${stamp}.`)).toBeVisible();
  await expect(page.getByRole("dialog", { name: "New product" })).toHaveCount(0);

  await page.getByLabel("Search", { exact: true }).fill(`E2E Searchable ${stamp}`);
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("link", { name: `E2E Searchable ${stamp}` })).toBeVisible();
  await expect(page.getByText("$42.50")).toBeVisible();
});

test("product form validation blocks empty submissions", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New product" }).click();
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page.getByText("Name is required.")).toBeVisible();
  await expect(page.getByText("SKU is required.")).toBeVisible();
  await expect(page.getByText("Price is required.")).toBeVisible();
});

test("the product form validates while typing and pairs fields on wider screens", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New product" }).click();
  const dialog = page.getByRole("dialog", { name: "New product" });

  await expect(dialog.getByText("Name is required.")).toHaveCount(0);
  await dialog.getByLabel("Price (USD)").fill("19.999");
  await expect(
    dialog.getByText("Price must be a nonnegative amount with at most two decimals."),
  ).toBeVisible();
  await expect(dialog.getByLabel("Price (USD)")).toHaveAttribute("aria-invalid", "true");
  await dialog.getByLabel("Price (USD)").fill("19.99");
  await expect(
    dialog.getByText("Price must be a nonnegative amount with at most two decimals."),
  ).toHaveCount(0);
  await expect(dialog.getByLabel("Price (USD)")).toHaveAttribute("aria-invalid", "false");

  const rows = async () =>
    Promise.all(
      ["Name", "SKU", "Description", "Category", "Price (USD)", "Stock", "Weight (kg)"].map(
        async (label) => (await dialog.getByLabel(label).boundingBox())?.y ?? 0,
      ),
    );
  const [name, sku, description, category, price, stock, weight] = await rows();
  expect(sku).toBe(name);
  expect(price).toBe(category);
  expect(weight).toBe(stock);
  expect(description).toBeGreaterThan(sku);

  await page.setViewportSize({ width: 390, height: 844 });
  const [narrowName, narrowSku, narrowCategory, narrowPrice] = await rows();
  expect(narrowSku).toBeGreaterThan(narrowName);
  expect(narrowPrice).toBeGreaterThan(narrowCategory);

  const submit = dialog.getByRole("button", { name: "Create product" });
  await expect(submit.locator("svg")).toBeVisible();
  await expect(submit.locator(".btn-label")).toBeHidden();
  await expect(dialog.getByRole("button", { name: "Cancel" }).locator("svg")).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(submit.locator(".btn-label")).toBeVisible();
  await expect(submit).toBeVisible();
});

test("price and weight show their unit inside the input", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New product" }).click();
  const dialog = page.getByRole("dialog", { name: "New product" });

  for (const [field, unit] of [
    ["price", "USD"],
    ["weightKg", "kg"],
  ] as const) {
    const input = dialog.locator(`[data-field="${field}"] input`);
    const suffix = dialog.locator(`[data-field="${field}"] .input-suffix`);
    await expect(suffix).toHaveText(unit);
    await expect(suffix).toBeVisible();

    const inputBox = await input.boundingBox();
    const suffixBox = await suffix.boundingBox();
    expect(suffixBox?.x ?? 0).toBeGreaterThan(inputBox?.x ?? 0);
    expect((suffixBox?.x ?? 0) + (suffixBox?.width ?? 0)).toBeLessThan(
      (inputBox?.x ?? 0) + (inputBox?.width ?? 0),
    );
    expect(suffixBox?.y ?? 0).toBeGreaterThanOrEqual(inputBox?.y ?? 0);
    expect((suffixBox?.y ?? 0) + (suffixBox?.height ?? 0)).toBeLessThanOrEqual(
      (inputBox?.y ?? 0) + (inputBox?.height ?? 0),
    );
  }

  await expect(dialog.getByLabel("Price (USD)")).toBeVisible();
  await expect(dialog.getByLabel("Weight (kg)")).toBeVisible();
  await dialog.getByLabel("Price (USD)").fill("19.99");
  await dialog.getByLabel("Weight (kg)").fill("0.350");
  await expect(
    dialog.getByText("Price must be a nonnegative amount", { exact: false }),
  ).toHaveCount(0);
});

test("duplicate SKU is reported on the SKU field", async ({ page }) => {
  const stamp = Date.now();
  const sku = `E2E-DUP-${stamp}`;
  const values = {
    name: "Original",
    sku,
    description: "",
    category: "E2E",
    price: "10.00",
    stock: "5",
    weightKg: "0.500",
  };
  await page.goto("/");
  await page.getByRole("button", { name: "New product" }).click();
  await fillProductForm(page, values);
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page.getByText("Created Original.")).toBeVisible();

  await page.getByRole("button", { name: "New product" }).click();
  await fillProductForm(page, { ...values, name: "Copy" });
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page.getByText("This SKU is already in use.")).toBeVisible();
});

test("buttons advertise a pointer cursor and disabled ones do not", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector("main ul li");

  const addToCart = page.getByRole("button", { name: "Add to cart" }).first();
  expect(await addToCart.evaluate((element) => getComputedStyle(element).cursor)).toBe("pointer");

  const cartButton = page.getByRole("banner").getByRole("button", { name: /Cart/ });
  expect(await cartButton.evaluate((element) => getComputedStyle(element).cursor)).toBe("pointer");

  await page.getByRole("checkbox", { name: "In stock only" }).uncheck();
  const disabled = page.getByRole("button", { name: "Add to cart", disabled: true }).first();
  await disabled.waitFor();
  expect(await disabled.evaluate((element) => getComputedStyle(element).cursor)).toBe(
    "not-allowed",
  );
});

test("buttons collapse to icons on narrow screens but stay labelled", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.waitForSelector("main ul li");

  const addToCart = page.getByRole("button", { name: "Add to cart" }).first();
  const newProduct = page.getByRole("button", { name: "New product" });
  await expect(addToCart).toBeVisible();
  await expect(addToCart.locator(".btn-label")).toBeHidden();
  await expect(addToCart.locator("svg")).toBeVisible();
  await expect(newProduct.locator(".btn-label")).toBeHidden();
  await expect(page.getByRole("banner").getByRole("button", { name: /^Cart/ })).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 844 });
  await expect(addToCart.locator(".btn-label")).toBeVisible();
  await expect(newProduct.locator(".btn-label")).toBeVisible();
});

test("catalog filters widen and stack on phone widths", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.waitForSelector("main ul li");

  const search = page.getByLabel("Search", { exact: true });
  const sort = page.getByLabel("Sort by");
  const order = page.getByLabel("Order");
  const cardBox = await page.getByRole("search").boundingBox();
  await expect(page.getByLabel("Category", { exact: true })).toHaveCount(0);

  for (const field of [search, sort, order]) {
    const box = await field.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan((cardBox?.width ?? 0) - 48);
  }

  const inStock = await page.getByRole("checkbox", { name: "In stock only" }).boundingBox();
  const archived = await page.getByRole("checkbox", { name: "Include archived" }).boundingBox();
  expect(archived?.y ?? 0).toBeGreaterThan(inStock?.y ?? 0);

  await page.setViewportSize({ width: 1280, height: 844 });
  expect((await search.boundingBox())?.width ?? 0).toBeLessThan((cardBox?.width ?? 0) - 48);
});

test("out-of-stock products stay hidden until the stock filter is cleared", async ({
  page,
  request,
}) => {
  const stamp = Date.now();
  const name = `Sold Out ${stamp}`;
  const created = await createProduct(request, { name, stock: 3 });
  const depleted = await request.patch(`${API_URL}/api/products/${created.id}`, {
    data: { stock: 0 },
  });
  if (!depleted.ok()) {
    throw new Error(`Deplete failed with status ${depleted.status()}`);
  }

  await page.goto("/");
  await expect(page.getByRole("checkbox", { name: "In stock only" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Include archived" })).not.toBeChecked();
  await page.getByLabel("Search", { exact: true }).fill(name);
  await expect(page.getByText("No matching products")).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveCount(0);

  await page.getByRole("checkbox", { name: "In stock only" }).uncheck();
  const card = page.getByRole("listitem").filter({ hasText: name });
  await expect(card).toHaveCount(1);
  await expect(card.getByText("Out of stock")).toBeVisible();
  await expect(card.getByRole("button", { name: "Add to cart" })).toBeDisabled();
});

test("edit and archive a product from its detail page", async ({ page }) => {
  const stamp = Date.now();
  const sku = `E2E-EA-${stamp}`;
  const name = `Editable ${stamp}`;
  await page.goto("/");
  await page.getByRole("button", { name: "New product" }).click();
  await fillProductForm(page, {
    name,
    sku,
    description: "Before edit",
    category: "E2E",
    price: "20.00",
    stock: "6",
    weightKg: "0.600",
  });
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page.getByText(`Created ${name}.`)).toBeVisible();

  await page.getByLabel("Search", { exact: true }).fill(name);
  const card = page.getByRole("listitem").filter({ hasText: name });
  await expect(card).toHaveCount(1);
  await expect(card.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Archive" })).toHaveCount(0);

  await card.getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to cart" })).toHaveCount(0);

  await page.getByRole("button", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit product" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("SKU")).toHaveValue(sku);
  await dialog.getByLabel("Price (USD)").fill("25.00");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(`Updated ${name}.`)).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Edit product" })).toHaveCount(0);
  await expect(page.getByText("$25.00")).toBeVisible();

  await page.getByRole("button", { name: "Archive" }).click();
  const confirm = page.getByRole("dialog", { name: `Archive ${name}?` });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Confirm archive" }).click();
  await expect(page.getByText("Product archived.")).toBeVisible();
  await expect(page.getByText("Archived", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);

  await page.getByRole("link", { name: "← Back to catalog" }).click();
  await page.getByRole("checkbox", { name: "Include archived" }).check();
  await page.getByLabel("Search", { exact: true }).fill(name);
  const archivedCard = page.getByRole("listitem").filter({ hasText: name });
  await expect(archivedCard.getByText("Archived", { exact: true })).toBeVisible();
  await expect(archivedCard.getByRole("button", { name: "Add to cart" })).toBeDisabled();
});
