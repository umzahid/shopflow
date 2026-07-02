import { expect, test } from "@playwright/test";
import { seedProduct } from "../helpers/api";
import { ProductDetailPage, ProductsPage } from "../pages/products.page";
import { NavComponent } from "../pages/nav.page";

test.describe("Browse & search", () => {
  test("TC-04: searching from the home page finds a seeded product", async ({
    page,
    request,
  }) => {
    const nav = new NavComponent(page);
    const products = new ProductsPage(page);
    let title: string;

    await test.step("Arrange: an active product exists (via API)", async () => {
      ({ title } = await seedProduct(request));
    });

    await test.step("Search for it from the home page", async () => {
      await page.goto("/");
      await nav.searchInput.fill(title);
      await nav.searchButton.click();
    });

    await test.step("The results include the product card", async () => {
      await expect(products.cardLink(title)).toBeVisible();
    });
  });

  test("TC-05: the listing filters by price and opens the product detail", async ({
    page,
    request,
  }) => {
    const products = new ProductsPage(page);
    const detail = new ProductDetailPage(page);
    let title: string;

    await test.step("Arrange: a product priced 18.50 exists (via API)", async () => {
      ({ title } = await seedProduct(request));
    });

    await test.step("Open /products and apply a price filter covering it", async () => {
      await products.goto();
      await expect(products.heading).toBeVisible();
      await products.minPriceInput.fill("10");
      await products.maxPriceInput.fill("25");
      await products.applyFiltersButton.click();
      await expect(products.cardLink(title)).toBeVisible();
    });

    await test.step("A filter excluding its price hides it", async () => {
      await products.minPriceInput.fill("100");
      await products.maxPriceInput.fill("200");
      await products.applyFiltersButton.click();
      await expect(products.cardLink(title)).toHaveCount(0);
    });

    await test.step("Reset, open the detail page, add-to-cart is available", async () => {
      await products.resetFiltersButton.click();
      await products.cardLink(title).click();
      await expect(detail.heading(title)).toBeVisible();
      await expect(detail.addToCartButton).toBeEnabled();
    });
  });
});
