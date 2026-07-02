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

  test("TC-13: a search with no matches shows the empty-results state", async ({ page }) => {
    const products = new ProductsPage(page);

    await test.step("Search for a nonsense term", async () => {
      await products.goto(`zzz-no-such-thing-${Date.now()}`);
    });

    await test.step("The no-results message is shown", async () => {
      await expect(products.noResultsMessage).toBeVisible();
    });
  });

  test("TC-14: a home category tile navigates to a filtered listing", async ({ page }) => {
    await test.step("Open the home page and follow a category tile", async () => {
      await page.goto("/");
      await page.getByRole("link", { name: "Electronics" }).click();
    });

    await test.step("Lands on /products with the category as the query", async () => {
      await expect(page).toHaveURL(/\/products\?q=electronics/);
    });
  });

  test("TC-15: a sold-out product cannot be added to the cart", async ({ page, request }) => {
    const products = new ProductsPage(page);
    const detail = new ProductDetailPage(page);
    let title: string;

    await test.step("Arrange: a product with zero stock (via API)", async () => {
      ({ title } = await seedProduct(request, { stock_qty: 0 }));
    });

    await test.step("Its card quick-add is disabled and reads Sold out", async () => {
      await products.goto(title);
      await expect(products.cardAddToCart(title)).toBeDisabled();
      await expect(products.cardAddToCart(title)).toHaveText(/Sold out/);
    });

    await test.step("The detail page add-to-cart is disabled too", async () => {
      await products.cardLink(title).click();
      await expect(detail.heading(title)).toBeVisible();
      await expect(page.getByRole("button", { name: "Sold out" })).toBeDisabled();
    });
  });

  test("TC-16: the detail qty stepper is capped at the stock level", async ({
    page,
    request,
  }) => {
    const products = new ProductsPage(page);
    const detail = new ProductDetailPage(page);
    let title: string;

    await test.step("Arrange: a product with stock 2 (via API)", async () => {
      ({ title } = await seedProduct(request, { stock_qty: 2 }));
    });

    await test.step("Clicking + past the stock stays at 2", async () => {
      await products.goto(title);
      await products.cardLink(title).click();
      await expect(detail.heading(title)).toBeVisible();
      await detail.increaseQty.click();
      await detail.increaseQty.click({ force: true }).catch(() => {});
      await detail.increaseQty.click({ force: true }).catch(() => {});
      await expect(detail.quantityGroup).toContainText("2");
    });
  });
});
