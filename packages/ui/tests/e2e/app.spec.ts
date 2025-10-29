import { test, expect } from "@playwright/test";

test("loads Codex Explorer", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Codex Explorer")).toBeVisible();
});
