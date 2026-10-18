import { test, expect } from "@playwright/test";

test("frontend loads with its shell and reaches the API", async ({ page }) => {
  const readiness = page.waitForResponse((response) => response.url().endsWith("/ready"));
  const catalog = page.waitForResponse((response) => response.url().includes("/api/products?"));

  await page.goto("/");
  await expect(page.getByRole("link", { name: "Ecommerce Challenge" })).toBeVisible();
  await expect(page.getByRole("banner").getByRole("button", { name: /Cart/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Product catalog" })).toBeVisible();

  expect((await readiness).status()).toBe(200);
  expect((await catalog).status()).toBe(200);
  await expect(page.getByText("API unreachable:")).toHaveCount(0);
});

test("unknown and retired routes fall back to the catalog", async ({ page }) => {
  for (const path of ["/products/new", "/import", "/cart", "/nope/deep/link"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Product catalog" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
});
