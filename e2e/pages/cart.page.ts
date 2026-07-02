import { Locator, Page } from "@playwright/test";

/**
 * /cart — client-rendered; line-item controls carry parameterized aria-labels,
 * so they are locator *functions* taking the product title.
 */
export class CartPage {
  readonly heading: Locator;
  readonly couponInput: Locator;
  readonly applyCouponButton: Locator;
  readonly proceedToCheckoutButton: Locator;
  readonly emptyMessage: Locator;

  constructor(readonly page: Page) {
    // exact: true — "Your cart" would otherwise also match the transient
    // "Loading your cart…" heading (strict-mode violation).
    this.heading = page.getByRole("heading", { name: "Your cart", exact: true });
    this.couponInput = page.getByLabel("Coupon code");
    this.applyCouponButton = page.getByRole("button", { name: "Apply" });
    this.proceedToCheckoutButton = page.getByRole("button", { name: "Proceed to checkout" });
    this.emptyMessage = page.getByText("Your cart is empty");
  }

  async goto() {
    await this.page.goto("/cart");
  }

  lineItemLink(title: string): Locator {
    return this.page.getByRole("link", { name: `View ${title}` });
  }

  increaseQty(title: string): Locator {
    return this.page.getByRole("button", { name: `Increase quantity of ${title}` });
  }

  decreaseQty(title: string): Locator {
    return this.page.getByRole("button", { name: `Decrease quantity of ${title}` });
  }

  removeItem(title: string): Locator {
    return this.page.getByRole("button", { name: `Remove ${title} from cart` });
  }

  qtyValue(title: string): Locator {
    return this.page.getByLabel(`Quantity for ${title}`);
  }
}
