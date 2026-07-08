import { Locator, Page } from "@playwright/test";

/**
 * Merchant admin pages (/merchant, /merchant/products, /merchant/orders).
 * Role-gated: only a signed-in merchant reaches these; the layout bounces
 * customers to the storefront.
 */
export class MerchantDashboardPage {
  readonly heading: Locator;
  readonly revenue30Card: Locator;
  readonly ordersByStatusHeading: Locator;

  constructor(readonly page: Page) {
    this.heading = page.getByRole("heading", { name: "Dashboard", level: 1 });
    // exact — the dashboard also has a "Revenue — last 30 days" chart heading
    this.revenue30Card = page.getByText("Last 30 days", { exact: true });
    this.ordersByStatusHeading = page.getByRole("heading", { name: "Orders by status" });
  }

  async goto() {
    await this.page.goto("/merchant");
  }
}

export class MerchantProductsPage {
  readonly heading: Locator;

  constructor(readonly page: Page) {
    this.heading = page.getByRole("heading", { name: "Products", level: 1 });
  }

  async goto() {
    await this.page.goto("/merchant/products");
  }

  /** The table row whose text contains the product title. */
  row(title: string): Locator {
    return this.page.getByRole("row").filter({ hasText: title });
  }

  archiveButton(title: string): Locator {
    return this.row(title).getByRole("button", { name: "Archive" });
  }
}

export class MerchantOrdersPage {
  readonly heading: Locator;
  readonly fraudPanel: Locator;

  constructor(readonly page: Page) {
    this.heading = page.getByRole("heading", { name: "Orders", level: 1 });
    this.fraudPanel = page.getByTestId("fraud-panel");
  }

  async goto() {
    await this.page.goto("/merchant/orders");
  }

  /** The table row for an order — the UI shows the first 8 chars of the id. */
  row(orderId: string): Locator {
    return this.page.getByRole("row").filter({ hasText: orderId.slice(0, 8) });
  }

  viewButton(orderId: string): Locator {
    return this.row(orderId).getByRole("button", { name: "View" });
  }
}
