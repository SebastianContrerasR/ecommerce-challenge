import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

async function fillProductForm(page: Page, values: Record<string, string>) {
  await page.getByLabel("Name").fill(values["name"] ?? "");
  await page.getByLabel("SKU").fill(values["sku"] ?? "");
  await page.getByLabel("Description").fill(values["description"] ?? "");
  await page.getByLabel("Category").fill(values["category"] ?? "");
  await page.getByLabel("Price (USD)").fill(values["price"] ?? "");
  await page.getByLabel("Stock").fill(values["stock"] ?? "");
  await page.getByLabel("Weight (kg)").fill(values["weightKg"] ?? "");
}

test("create a product and find it using search", async ({ page }) => {
  const stamp = Date.now();
  const sku = `E2E-P-${stamp}`;
  await page.goto("/products/new");
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
  await expect(page.getByRole("heading", { name: `E2E Searchable ${stamp}` })).toBeVisible();
  await expect(page.getByText("$42.50")).toBeVisible();

  await page.getByRole("link", { name: "Catalog", exact: true }).click();
  await page.getByLabel("Search", { exact: true }).fill(`E2E Searchable ${stamp}`);
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("link", { name: `E2E Searchable ${stamp}` })).toBeVisible();
});

test("product form validation blocks empty submissions", async ({ page }) => {
  await page.goto("/products/new");
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page.getByText("Name is required.")).toBeVisible();
  await expect(page.getByText("SKU is required.")).toBeVisible();
  await expect(page.getByText("Price is required.")).toBeVisible();
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
  await page.goto("/products/new");
  await fillProductForm(page, values);
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page.getByRole("heading", { name: "Original" })).toBeVisible();

  await page.goto("/products/new");
  await fillProductForm(page, { ...values, name: "Copy" });
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page.getByText("This SKU is already in use.")).toBeVisible();
});

test("edit and archive flow", async ({ page }) => {
  const stamp = Date.now();
  const sku = `E2E-EA-${stamp}`;
  await page.goto("/products/new");
  await fillProductForm(page, {
    name: `Editable ${stamp}`,
    sku,
    description: "Before edit",
    category: "E2E",
    price: "20.00",
    stock: "6",
    weightKg: "0.600",
  });
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page.getByRole("heading", { name: `Editable ${stamp}` })).toBeVisible();

  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Price (USD)").fill("25.00");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("$25.00")).toBeVisible();

  await page.getByRole("button", { name: "Archive product" }).click();
  await page.getByRole("button", { name: "Confirm archive" }).click();
  await expect(page.getByText("Product archived.")).toBeVisible();
  await expect(page.getByText("Archived", { exact: true })).toBeVisible();
});
