import { expect, test } from "@playwright/test";
import { PASSWORD, registerUser, uniqueEmail } from "../helpers/api";
import { LoginPage } from "../pages/auth.page";
import {
  MerchantDashboardPage,
  MerchantOrdersPage,
  MerchantProductsPage,
} from "../pages/merchant.page";

const API = process.env.E2E_API_URL ?? "http://localhost:8000/api/v1";

test.describe("Merchant admin", () => {
  test("TC-23: a merchant signs in and sees the dashboard", async ({ page, request }) => {
    const email = uniqueEmail("e2e-merch-dash");
    await test.step("Arrange: a merchant account (via API)", async () => {
      await registerUser(request, { email, role: "merchant" });
    });

    const login = new LoginPage(page);
    const dash = new MerchantDashboardPage(page);

    await test.step("Sign in through the UI", async () => {
      await login.goto();
      await login.login(email, PASSWORD);
      await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
    });

    await test.step("The dashboard renders its cards and charts", async () => {
      await dash.goto();
      await expect(dash.heading).toBeVisible({ timeout: 15_000 });
      await expect(dash.revenue30Card).toBeVisible();
      await expect(dash.ordersByStatusHeading).toBeVisible();
    });
  });

  test("TC-24: the product manager lists the merchant's product and can archive it", async ({
    page,
    request,
  }) => {
    const email = uniqueEmail("e2e-merch-prod");
    const title = `E2E Mgr Product ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

    await test.step("Arrange: merchant + an active product (via API)", async () => {
      const token = await registerUser(request, { email, role: "merchant" });
      const res = await request.post(`${API}/products`, {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          title,
          description: "Seeded for the merchant product-manager e2e",
          price: 25.0,
          stock_qty: 8,
          status: "active",
        },
      });
      expect(res.status(), "seed product").toBe(201);
    });

    const login = new LoginPage(page);
    const products = new MerchantProductsPage(page);

    await test.step("Sign in and open the product manager", async () => {
      await login.goto();
      await login.login(email, PASSWORD);
      await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
      await products.goto();
      await expect(products.heading).toBeVisible({ timeout: 15_000 });
    });

    await test.step("The product appears and can be archived", async () => {
      await expect(products.row(title)).toBeVisible();
      await products.archiveButton(title).click();
      // After archiving, the row's status badge flips to "archived".
      await expect(products.row(title).getByText("archived")).toBeVisible({ timeout: 10_000 });
    });
  });

  test("TC-25: a customer is redirected away from the merchant area", async ({ page, request }) => {
    const email = uniqueEmail("e2e-cust-guard");
    await test.step("Arrange: a customer account (via API)", async () => {
      await registerUser(request, { email });
    });

    const login = new LoginPage(page);

    await test.step("Sign in as a customer", async () => {
      await login.goto();
      await login.login(email, PASSWORD);
      await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
    });

    await test.step("Visiting /merchant bounces to the storefront", async () => {
      await page.goto("/merchant");
      await expect(page).toHaveURL(/\/$|\/(?!merchant)/, { timeout: 15_000 });
      await expect(new MerchantDashboardPage(page).heading).toHaveCount(0);
    });
  });
});
