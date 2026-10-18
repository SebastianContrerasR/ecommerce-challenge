import { test, expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

const API_URL = process.env["E2E_API_URL"] ?? "http://localhost:3000";

async function createProduct(
  request: APIRequestContext,
  overrides: Record<string, unknown>,
): Promise<{ id: string }> {
  const response = await request.post(`${API_URL}/api/products`, {
    data: {
      name: "E2E Product",
      sku: `E2E-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      description: "Created for checkout tests",
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

test("purchase an in-stock product and confirm the order", async ({ page, request }) => {
  const stamp = Date.now();
  await createProduct(request, { name: `Buyable ${stamp}`, price: "15.00", stock: 10 });
  await page.goto("/");
  await page.getByLabel("Search", { exact: true }).fill(`Buyable ${stamp}`);
  const buyableCard = page.getByRole("listitem").filter({ hasText: `Buyable ${stamp}` });
  await expect(buyableCard).toHaveCount(1);
  await buyableCard.getByRole("button", { name: "Add to cart" }).click();
  await page.getByRole("banner").getByRole("button", { name: /Cart/ }).click();
  await expect(page.getByRole("dialog", { name: "Shopping cart" })).toBeVisible();
  await expect(page.getByText("Buyable", { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByRole("heading", { name: "Order confirmed" })).toBeVisible();
  await expect(page.getByText("Payment succeeded. Order total $15.00.")).toBeVisible();
  await page.getByRole("link", { name: "View order details" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Total charged")).toBeVisible();
  await expect(page.getByText("$15.00").first()).toBeVisible();

  const placed = page.locator("time").first();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeHidden();
  await placed.hover();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).not.toHaveText("2024-");
  await placed.blur();
  await page.mouse.move(0, 0);
  await expect(tooltip).toBeHidden();

  const itemName = page.getByRole("listitem").first().locator("> span").first();
  const itemAmount = page.getByRole("listitem").first().locator("> span").last();
  const wideName = await itemName.boundingBox();
  const wideAmount = await itemAmount.boundingBox();
  expect(wideName?.y).toBe(wideAmount?.y);

  await page.setViewportSize({ width: 390, height: 844 });
  const narrowName = await itemName.boundingBox();
  const narrowAmount = await itemAmount.boundingBox();
  expect(narrowAmount?.y ?? 0).toBeGreaterThan(narrowName?.y ?? 0);
});

test("opening the cart drawer does not shift the page", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 400 });
  await page.goto("/");
  await page.waitForSelector("main ul li");
  const brand = page.getByRole("banner").getByRole("link", { name: "Ecommerce Challenge" });
  const before = await brand.boundingBox();

  const gutter = await page.evaluate(
    () => getComputedStyle(document.documentElement).scrollbarGutter,
  );
  expect(gutter).toBe("stable");

  await page.getByRole("banner").getByRole("button", { name: /Cart/ }).click();
  await page.waitForSelector("role=dialog");
  const after = await brand.boundingBox();

  expect(before).not.toBeNull();
  expect(after?.x).toBe(before?.x);
  expect(after?.width).toBe(before?.width);
});

test("inventory conflict is reported when stock disappears before checkout", async ({
  page,
  request,
}) => {
  const stamp = Date.now();
  const created = await createProduct(request, {
    name: `Scarce ${stamp}`,
    price: "9.99",
    stock: 1,
  });
  await page.goto("/");
  await page.getByLabel("Search", { exact: true }).fill(`Scarce ${stamp}`);
  const scarceCard = page.getByRole("listitem").filter({ hasText: `Scarce ${stamp}` });
  await expect(scarceCard).toHaveCount(1);
  await scarceCard.getByRole("button", { name: "Add to cart" }).click();
  await page.getByRole("banner").getByRole("button", { name: /Cart/ }).click();
  const depleted = await request.patch(`${API_URL}/api/products/${created.id}`, {
    data: { stock: 0 },
  });
  if (!depleted.ok()) {
    throw new Error(`Deplete failed with status ${depleted.status()}`);
  }
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByText(/no longer in stock/)).toBeVisible();
});
