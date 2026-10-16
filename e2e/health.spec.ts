import { test, expect } from "@playwright/test";

test("frontend loads with navigation and API status", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Ecommerce Challenge" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByText("API base URL:")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Product catalog" })).toBeVisible();
});
