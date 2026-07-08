import { expect, test } from "@playwright/test";
import { PASSWORD, registerUser, uniqueEmail } from "../helpers/api";
import { LoginPage } from "../pages/auth.page";
import { MerchantOrdersPage } from "../pages/merchant.page";

const API = process.env.E2E_API_URL ?? "http://localhost:8000/api/v1";

/**
 * PRD scenario 32: an order that trips the fraud model lands in
 * `pending_review`, and the merchant sees the flag — with reasons — in the
 * order manager UI. The order is arranged via API (standard arrange/act
 * split); the profile below scores ~0.998 with the committed LightGBM model:
 * brand-new account + very high order value + billing/shipping mismatch.
 */
test("TC-27: a fraud-flagged order shows score and reasons in the merchant order drawer", async ({
  page,
  request,
}) => {
  const merchantEmail = uniqueEmail("e2e-fraud-merch");
  let orderId = "";

  await test.step("Arrange: a high-risk checkout that the model flags (via API)", async () => {
    const merchantToken = await registerUser(request, {
      email: merchantEmail,
      role: "merchant",
    });
    const product = await request.post(`${API}/products`, {
      headers: { Authorization: `Bearer ${merchantToken}` },
      data: {
        title: `E2E Gold Bar ${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        price: 4999.0,
        stock_qty: 50,
        status: "active",
      },
    });
    expect(product.status(), "seed product").toBe(201);
    const productId = (await product.json()).id as string;

    const customerToken = await registerUser(request, {
      email: uniqueEmail("e2e-fraud-cust"),
    });
    const add = await request.post(`${API}/cart/items`, {
      headers: { Authorization: `Bearer ${customerToken}` },
      data: { product_id: productId, qty: 10 },
    });
    expect(add.status(), "cart add").toBe(201);

    const checkout = await request.post(`${API}/orders/checkout`, {
      headers: { Authorization: `Bearer ${customerToken}` },
      data: {
        shipping_address: { line1: "1 E2E St", city: "Islamabad", postal_code: "44000", country: "PK" },
        billing_address: { line1: "999 Other Rd", city: "Elsewhere", postal_code: "00001", country: "US" },
      },
    });
    expect(checkout.status(), "checkout").toBe(201);
    const order = await checkout.json();
    orderId = order.id as string;
    // If this ever fails the model changed — the UI assertion below would be
    // vacuous, so fail loudly here in the arrange step.
    expect(order.status, "order flagged by fraud model").toBe("pending_review");
  });

  const login = new LoginPage(page);
  const orders = new MerchantOrdersPage(page);

  await test.step("Sign in as the merchant", async () => {
    await login.goto();
    await login.login(merchantEmail, PASSWORD);
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
  });

  await test.step("The flagged order is visible with pending-review status", async () => {
    await orders.goto();
    await expect(orders.heading).toBeVisible({ timeout: 15_000 });
    await expect(orders.row(orderId)).toBeVisible({ timeout: 15_000 });
    await expect(orders.row(orderId)).toContainText(/pending review/i);
  });

  await test.step("The order drawer shows the fraud flag, score, and reasons", async () => {
    await orders.viewButton(orderId).click();
    await expect(orders.fraudPanel).toBeVisible({ timeout: 10_000 });
    await expect(orders.fraudPanel).toContainText("Flagged for review");
    await expect(orders.fraudPanel).toContainText(/Risk score \d\.\d\d/);
    // Top SHAP reasons — at least the high-value signal must be spelled out.
    await expect(orders.fraudPanel).toContainText("Unusually high order value");
  });
});
