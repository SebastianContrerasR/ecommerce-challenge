import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

async function uploadCsv(page: Page, filename: string, csv: string) {
  await page.getByLabel("CSV file").setInputFiles({
    name: filename,
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });
  await page.getByRole("button", { name: "Import" }).click();
}

test("csv import uploads and refreshes the catalog", async ({ page }) => {
  const stamp = Date.now();
  const csv = [
    "name,sku,description,category,price,stock,weight_kg",
    `E2E First,E2E-${stamp}-1,First e2e product,Electronics,19.99,10,0.100`,
    `E2E Second,E2E-${stamp}-2,Second e2e product,Electronics,29.99,20,0.200`,
  ].join("\n");
  await page.goto("/");
  await page.getByRole("link", { name: "Import" }).click();
  await expect(page.getByRole("heading", { name: "Import products from CSV" })).toBeVisible();
  await uploadCsv(page, "e2e-import.csv", csv);
  await expect(page.getByText("Created 2 products from 2 records.")).toBeVisible();
  await page.goto("/");
  await page.getByLabel("Search", { exact: true }).fill(`E2E-${stamp}-1`);
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "E2E First" })).toBeVisible();
});

test("failed import shows structured errors and recovers on retry", async ({ page }) => {
  const stamp = Date.now();
  const bad = [
    "name,sku,description,category,price,stock,weight_kg",
    `Bad Price,E2E-${stamp}-bad,Broken row,Electronics,free,10,0.100`,
  ].join("\n");
  const good = [
    "name,sku,description,category,price,stock,weight_kg",
    `Good Row,E2E-${stamp}-good,Fixed row,Electronics,9.99,10,0.100`,
  ].join("\n");
  await page.goto("/import");
  await uploadCsv(page, "bad.csv", bad);
  await expect(page.getByText(/Import rejected: 1 errors in 1 records/)).toBeVisible();
  await expect(page.getByText(/Record 1, field price/)).toBeVisible();
  await page.getByRole("button", { name: "Choose another file" }).click();
  await uploadCsv(page, "good.csv", good);
  await expect(page.getByText("Created 1 products from 1 records.")).toBeVisible();
  await page.goto("/");
  await page.getByLabel("Search", { exact: true }).fill(`E2E-${stamp}-good`);
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Good Row" })).toBeVisible();
});

test("imports the supplied challenge fixture and shows the product", async ({ page }) => {
  const csv = readFileSync(
    new URL("../apps/api/test/fixtures/csv/challenge-example.csv", import.meta.url),
  );
  await page.goto("/");
  await page.getByRole("link", { name: "Import" }).click();
  await expect(page.getByRole("heading", { name: "Import products from CSV" })).toBeVisible();
  await page.getByLabel("CSV file").setInputFiles({
    name: "challenge-example.csv",
    mimeType: "text/csv",
    buffer: csv,
  });
  await page.getByRole("button", { name: "Import" }).click();
  await expect(
    page
      .getByText("Created 1 products from 1 records.")
      .or(page.getByText("Import rejected: 1 errors in 1 records.")),
  ).toBeVisible();
  if (await page.getByText("Created 1 products from 1 records.").isVisible()) {
    await expect(page.getByText("Import rejected")).toHaveCount(0);
  } else {
    await expect(page.getByText("Record 1, field sku [SKU_EXISTS]")).toBeVisible();
  }
  await page.goto("/");
  await page.getByLabel("Search", { exact: true }).fill("RS-001");
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Running Shoes" })).toBeVisible();
});
