import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  PASSWORD,
  registerUser,
  seedDeliveredOrderWithReview,
  seedProduct,
  uniqueEmail,
} from "../helpers/api";
import { LoginPage } from "../pages/auth.page";
import { CheckoutPage } from "../pages/checkout.page";
import { ProductDetailPage } from "../pages/products.page";
import {
  MerchantAnalyticsPage,
  MerchantDashboardPage,
  MerchantOrdersPage,
  MerchantProductsPage,
} from "../pages/merchant.page";

/**
 * Accessibility audit (WCAG 2.1 A/AA) via axe-core on the key public pages plus
 * the authenticated surfaces (account, product detail, merchant admin, checkout).
 * Fails on any *serious* or *critical* violation — the PRD's "zero critical
 * issues" bar.
 */
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const API = process.env.E2E_API_URL ?? "http://localhost:8000/api/v1";

/** Audit whatever is currently rendered — callers wait for the loaded state first. */
async function expectAxeClean(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  // Surface details in the report when it fails.
  expect(blocking, JSON.stringify(blocking.map((v) => ({ id: v.id, nodes: v.nodes.length })), null, 2)).toEqual([]);
}

async function auditsClean(page: Page, url: string) {
  await page.goto(url);
  await expectAxeClean(page);
}

async function uiLogin(page: Page, email: string) {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(email, PASSWORD);
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
}

/**
 * A merchant account with one active product; `withOrder` walks a customer
 * purchase to `delivered` + review so dashboards/orders/analytics render
 * populated states rather than empty placeholders.
 */
async function seedMerchant(
  request: import("@playwright/test").APIRequestContext,
  opts: { withOrder?: boolean } = {},
): Promise<{ email: string }> {
  const email = uniqueEmail("e2e-a11y-merch");
  const merchantToken = await registerUser(request, { email, role: "merchant" });
  const res = await request.post(`${API}/products`, {
    headers: { Authorization: `Bearer ${merchantToken}` },
    data: {
      title: `E2E A11y Product ${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      description: "Seeded for the accessibility audit",
      price: 21.0,
      stock_qty: 9,
      status: "active",
    },
  });
  expect(res.status(), "seed product").toBe(201);
  const productId = (await res.json()).id as string;

  if (opts.withOrder) {
    const customerToken = await registerUser(request, {
      email: uniqueEmail("e2e-a11y-cust"),
    });
    await seedDeliveredOrderWithReview(request, {
      customerToken,
      merchantToken,
      productId,
      rating: 5,
      comment: "Accessibility audit order seed",
    });
  }
  return { email };
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
    await page.request.post(`${API}/auth/register`, {
      data: { email, password: PASSWORD, full_name: "A11y User" },
    });
    await login.goto();
    await login.login(email, PASSWORD);
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
    await auditsClean(page, "/account");
  });

  test("TC-A6: product detail page has no serious/critical violations", async ({ page, request }) => {
    // A published review makes the histogram, stars, and review list render.
    const { id, title, merchantToken } = await seedProduct(request);
    const customerToken = await registerUser(request, {
      email: uniqueEmail("e2e-a11y-cust"),
    });
    await seedDeliveredOrderWithReview(request, {
      customerToken,
      merchantToken,
      productId: id,
      rating: 4,
      comment: "Sturdy and well made — accessibility audit seed",
    });

    const detail = new ProductDetailPage(page);
    await page.goto(`/products/${id}`);
    await expect(detail.heading(title)).toBeVisible({ timeout: 15_000 });
    await expectAxeClean(page);
  });

  test("TC-A7: merchant dashboard has no serious/critical violations", async ({ page, request }) => {
    const { email } = await seedMerchant(request, { withOrder: true });
    await uiLogin(page, email);

    const dash = new MerchantDashboardPage(page);
    await dash.goto();
    await expect(dash.heading).toBeVisible({ timeout: 15_000 });
    await expect(dash.revenue30Card).toBeVisible();
    await expectAxeClean(page);
  });

  test("TC-A8: merchant product manager has no serious/critical violations", async ({ page, request }) => {
    const { email } = await seedMerchant(request);
    await uiLogin(page, email);

    const products = new MerchantProductsPage(page);
    await products.goto();
    await expect(products.heading).toBeVisible({ timeout: 15_000 });
    await expectAxeClean(page);
  });

  test("TC-A9: merchant orders page has no serious/critical violations", async ({ page, request }) => {
    const { email } = await seedMerchant(request, { withOrder: true });
    await uiLogin(page, email);

    const orders = new MerchantOrdersPage(page);
    await orders.goto();
    await expect(orders.heading).toBeVisible({ timeout: 15_000 });
    await expectAxeClean(page);
  });

  test("TC-A10: merchant analytics page has no serious/critical violations", async ({ page, request }) => {
    const { email } = await seedMerchant(request, { withOrder: true });
    await uiLogin(page, email);

    const analytics = new MerchantAnalyticsPage(page);
    await analytics.goto();
    await expect(analytics.heading).toBeVisible({ timeout: 15_000 });
    await expectAxeClean(page);
  });

  test("TC-A11: checkout page has no serious/critical violations", async ({ page, request }) => {
    // The storefront cart lives in localStorage, so it must be filled through
    // the UI — an API-seeded server cart leaves /checkout on its empty state.
    const email = uniqueEmail("e2e-a11y-buyer");
    await registerUser(request, { email });
    const { id, title } = await seedProduct(request);

    await uiLogin(page, email);
    const detail = new ProductDetailPage(page);
    await page.goto(`/products/${id}`);
    await expect(detail.heading(title)).toBeVisible({ timeout: 15_000 });
    await detail.addToCartButton.click();

    const checkout = new CheckoutPage(page);
    await page.goto("/checkout");
    await expect(checkout.placeOrderButton).toBeVisible({ timeout: 15_000 });
    await expectAxeClean(page);
  });
});
