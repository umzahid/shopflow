import { Locator, Page } from "@playwright/test";

/** /checkout — auth-gated form; success redirects to /orders/{id}. */
export class CheckoutPage {
  readonly streetInput: Locator;
  readonly cityInput: Locator;
  readonly postalCodeInput: Locator;
  readonly countryInput: Locator;
  readonly couponInput: Locator;
  readonly placeOrderButton: Locator;

  constructor(readonly page: Page) {
    this.streetInput = page.getByLabel("Street address");
    this.cityInput = page.getByLabel("City", { exact: true });
    this.postalCodeInput = page.getByLabel("Postal code");
    this.countryInput = page.getByLabel("Country (ISO code)");
    this.couponInput = page.getByLabel("Coupon code");
    this.placeOrderButton = page.getByRole("button", { name: "Place order" });
  }

  async fillAddress(a: { street: string; city: string; postal: string; country: string }) {
    await this.streetInput.fill(a.street);
    await this.cityInput.fill(a.city);
    await this.postalCodeInput.fill(a.postal);
    await this.countryInput.fill(a.country);
  }
}
