import { expect, test } from "@playwright/test";
import { PASSWORD, registerUser, seedProduct, uniqueEmail } from "../helpers/api";
import { LoginPage } from "../pages/auth.page";
import { CartPage } from "../pages/cart.page";
import { CheckoutPage } from "../pages/checkout.page";
import { ProductDetailPage, ProductsPage } from "../pages/products.page";
import { NavComponent } from "../pages/nav.page";

test.describe("Cart & checkout journey", () => {
  test("TC-06: add to cart from the product detail page", async ({ page, request }) => {
    const products = new ProductsPage(page);
    const detail = new ProductDetailPage(page);
    const cart = new CartPage(page);
    let title: string;

    await test.step("Arrange: product exists (via API)", async () => {
      ({ title } = await seedProduct(request));
    });

    await test.step("Open its detail page and add 2 to the cart", async () => {
      await products.goto(title);
      await products.cardLink(title).click();
      await detail.increaseQty.click(); // 1 -> 2
      await detail.addToCartButton.click();
    });

    await test.step("The cart shows the line with qty 2", async () => {
      await cart.goto();
      await expect(cart.heading).toBeVisible();
      await expect(cart.lineItemLink(title)).toBeVisible();
      await expect(cart.qtyValue(title)).toContainText("2");
    });
  });

  test("TC-07: cart line controls — stepper and remove", async ({ page, request }) => {
    const products = new ProductsPage(page);
    const detail = new ProductDetailPage(page);
    const cart = new CartPage(page);
    let title: string;

    await test.step("Arrange: product in cart (UI add, qty 1)", async () => {
      ({ title } = await seedProduct(request));
      await products.goto(title);
      await products.cardLink(title).click();
      await detail.addToCartButton.click();
      await cart.goto();
      await expect(cart.lineItemLink(title)).toBeVisible();
    });

    await test.step("Increase then decrease the quantity", async () => {
      await cart.increaseQty(title).click();
      await expect(cart.qtyValue(title)).toContainText("2");
      await cart.decreaseQty(title).click();
      await expect(cart.qtyValue(title)).toContainText("1");
    });

    await test.step("Remove the line — cart no longer lists it", async () => {
      await cart.removeItem(title).click();
      await expect(cart.lineItemLink(title)).toHaveCount(0);
    });
  });

  test("TC-08: full journey — sign in, add to cart, checkout, order confirmed", async ({
    page,
    request,
  }) => {
    const login = new LoginPage(page);
    const nav = new NavComponent(page);
    const products = new ProductsPage(page);
    const detail = new ProductDetailPage(page);
    const cart = new CartPage(page);
    const checkout = new CheckoutPage(page);
    const email = uniqueEmail("e2e-buyer");
    let title: string;

    await test.step("Arrange: customer account + product (via API)", async () => {
      await registerUser(request, { email });
      ({ title } = await seedProduct(request));
    });

    await test.step("Sign in through the UI", async () => {
      await login.goto();
      await login.login(email, PASSWORD);
      await expect(nav.signOutButton).toBeVisible();
    });

    await test.step("Add the product to the cart", async () => {
      await products.goto(title);
      await products.cardLink(title).click();
      await detail.addToCartButton.click();
      await cart.goto();
      await expect(cart.lineItemLink(title)).toBeVisible();
    });

    await test.step("Proceed to checkout and fill the shipping address", async () => {
      await cart.proceedToCheckoutButton.click();
      await expect(page).toHaveURL(/\/checkout/);
      await checkout.fillAddress({
        street: "1 E2E Test Street",
        city: "Islamabad",
        postal: "44000",
        country: "PK",
      });
    });

    await test.step("Place the order — redirected to the order page", async () => {
      await checkout.placeOrderButton.click();
      // Checkout runs live fraud scoring server-side, then redirects.
      await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}/, { timeout: 20_000 });
    });
  });
});
