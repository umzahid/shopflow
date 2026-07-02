import { Locator, Page } from "@playwright/test";

/** /products — listing with filters, sort, and product cards. */
export class ProductsPage {
  readonly heading: Locator;
  readonly minPriceInput: Locator;
  readonly maxPriceInput: Locator;
  readonly applyFiltersButton: Locator;
  readonly resetFiltersButton: Locator;
  readonly sortSelect: Locator;

  constructor(readonly page: Page) {
    this.heading = page.getByRole("heading", { name: "All products" });
    this.minPriceInput = page.getByLabel("Minimum price");
    this.maxPriceInput = page.getByLabel("Maximum price");
    this.applyFiltersButton = page.getByRole("button", { name: "Apply" });
    this.resetFiltersButton = page.getByRole("button", { name: "Reset" });
    this.sortSelect = page.getByLabel("Sort by");
  }

  async goto(query?: string) {
    await this.page.goto(query ? `/products?q=${encodeURIComponent(query)}` : "/products");
  }

  /** Product-card link: aria-label `View ${title}`. */
  cardLink(title: string): Locator {
    return this.page.getByRole("link", { name: `View ${title}` });
  }

  /** Card quick-add button: aria-label `Add ${title} to cart`. */
  cardAddToCart(title: string): Locator {
    return this.page.getByRole("button", { name: `Add ${title} to cart` });
  }
}

/** /products/[id] — detail with qty stepper and add-to-cart. */
export class ProductDetailPage {
  readonly quantityGroup: Locator;
  readonly increaseQty: Locator;
  readonly decreaseQty: Locator;
  readonly addToCartButton: Locator;

  constructor(readonly page: Page) {
    this.quantityGroup = page.getByLabel("Quantity", { exact: true });
    this.increaseQty = page.getByRole("button", { name: "Increase quantity" });
    this.decreaseQty = page.getByRole("button", { name: "Decrease quantity" });
    this.addToCartButton = page.getByRole("button", { name: "Add to cart" });
  }

  heading(title: string): Locator {
    return this.page.getByRole("heading", { name: title });
  }
}
