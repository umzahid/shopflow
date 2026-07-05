import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { PASSWORD, uniqueEmail } from "../helpers/api";
import { LoginPage } from "../pages/auth.page";

/**
 * Accessibility audit (WCAG 2.1 A/AA) via axe-core on the key public pages plus
 * one authenticated page. Fails on any *serious* or *critical* violation —
 * the PRD's "zero critical issues" bar.
 */
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function auditsClean(page: import("@playwright/test").Page, url: string) {
  await page.goto(url);
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  // Surface details in the report when it fails.
  expect(blocking, JSON.stringify(blocking.map((v) => ({ id: v.id, nodes: v.nodes.length })), null, 2)).toEqual([]);
}

test.describe("Accessibility (axe, WCAG 2.1 AA)", () => {
  test("TC-A1: home page has no serious/critical violations", async ({ page }) => {
    await auditsClean(page, "/");
  });

  test("TC-A2: product listing has no serious/critical violations", async ({ page }) => {
    await auditsClean(page, "/products");
  });

  test("TC-A3: login page has no serious/critical violations", async ({ page }) => {
    await auditsClean(page, "/login");
  });

  test("TC-A4: cart page has no serious/critical violations", async ({ page }) => {
    await auditsClean(page, "/cart");
  });

  test("TC-A5: account page (authenticated) has no serious/critical violations", async ({ page }) => {
    const login = new LoginPage(page);
    const email = uniqueEmail("e2e-a11y");
    await page.request.post(`${process.env.E2E_API_URL ?? "http://localhost:8000/api/v1"}/auth/register`, {
      data: { email, password: PASSWORD, full_name: "A11y User" },
    });
    await login.goto();
    await login.login(email, PASSWORD);
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
    await auditsClean(page, "/account");
  });
});
