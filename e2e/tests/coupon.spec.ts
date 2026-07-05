import { expect, test } from "@playwright/test";
import { PASSWORD, registerUser, seedProduct, uniqueEmail } from "../helpers/api";
import { LoginPage } from "../pages/auth.page";
import { CartPage } from "../pages/cart.page";
import { CheckoutPage } from "../pages/checkout.page";
import { ProductDetailPage, ProductsPage } from "../pages/products.page";
import { NavComponent } from "../pages/nav.page";

const API = process.env.E2E_API_URL ?? "http://localhost:8000/api/v1";
const AUTH = (t: string) => ({ Authorization: `Bearer ${t}` });

async function registerAdmin(request: import("@playwright/test").APIRequestContext) {
  const res = await request.post(`${API}/auth/register`, {
    data: { email: uniqueEmail("e2e-admin"), password: PASSWORD, full_name: "Admin", role: "admin" },
  });
  expect(res.status(), "register admin").toBe(201);
  return (await res.json()).access_token as string;
}

test.describe("Coupon redemption (scenario 33)", () => {
  test("TC-26: admin coupon is redeemed at checkout, discount applied, usage limit enforced", async ({
    page,
    request,
  }) => {
    const login = new LoginPage(page);
    const nav = new NavComponent(page);
    const products = new ProductsPage(page);
    const detail = new ProductDetailPage(page);
    const cart = new CartPage(page);
    const checkout = new CheckoutPage(page);

    const code = `E2E10-${Date.now()}`;
    const email = uniqueEmail("e2e-coupon-buyer");
    let productId = "";
    let title = "";

    await test.step("Arrange: admin creates a 10% single-use coupon (via API)", async () => {
      const admin = await registerAdmin(request);
      const res = await request.post(`${API}/admin/coupons`, {
        headers: AUTH(admin),
        data: { code, discount_type: "percentage", value: 10, usage_limit: 1 },
      });
      expect(res.status(), "create coupon").toBe(201);
    });

    await test.step("Arrange: signed in with a product in the cart (via UI)", async () => {
      await registerUser(request, { email });
      ({ id: productId, title } = await seedProduct(request));
      await login.goto();
      await login.login(email, PASSWORD);
      await expect(nav.signOutButton).toBeVisible({ timeout: 15_000 });
      await products.goto(title);
      await products.cardLink(title).click();
      await detail.addToCartButton.click();
      await cart.goto();
      await cart.proceedToCheckoutButton.click();
      await expect(page).toHaveURL(/\/checkout/);
    });

    await test.step("Redeem the coupon at checkout", async () => {
      await checkout.fillAddress({ street: "1 E2E St", city: "Islamabad", postal: "44000", country: "PK" });
      await checkout.couponInput.fill(code);
      await checkout.placeOrderButton.click();
    });

    await test.step("Order confirms and the discount is shown", async () => {
      await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+/, { timeout: 15_000 });
      await expect(page.getByText("Discount")).toBeVisible();
    });

    await test.step("A second redemption is rejected — usage limit enforced", async () => {
      const other = uniqueEmail("e2e-coupon-buyer2");
      await registerUser(request, { email: other });
      const loginRes = await request.post(`${API}/auth/login`, { data: { email: other, password: PASSWORD } });
      const token = (await loginRes.json()).access_token as string;
      await request.post(`${API}/cart/items`, { headers: AUTH(token), data: { product_id: productId, qty: 1 } });
      const res = await request.post(`${API}/orders/checkout`, {
        headers: AUTH(token),
        data: {
          shipping_address: { line1: "2 E2E St", city: "Lahore", postal_code: "54000", country: "PK" },
          coupon_code: code,
        },
      });
      expect(res.status(), "second redemption blocked").toBe(400);
    });
  });
});
