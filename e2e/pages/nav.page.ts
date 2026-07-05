import { Locator, Page } from "@playwright/test";

/**
 * Header/navigation — shared across all pages.
 * Locators discovered from the live DOM via the find-locators workflow
 * (.claude/skills/find-locators). Do not hand-edit without re-verifying.
 */
export class NavComponent {
  readonly brandLink: Locator;
  readonly openCartButton: Locator;
  readonly signInLink: Locator;
  readonly signOutButton: Locator;
  readonly searchInput: Locator;
  readonly searchButton: Locator;

  constructor(readonly page: Page) {
    this.brandLink = page.getByRole("link", { name: "ShopFlow" });
    this.openCartButton = page.getByRole("button", { name: "Open cart" });
    this.signInLink = page.getByRole("link", { name: "Sign in" });
    // AuthMenu renders "Sign out" only when authenticated — the signed-in signal.
    this.signOutButton = page.getByRole("button", { name: "Sign out" });
    this.searchInput = page.getByLabel("Search products");
    this.searchButton = page.getByRole("button", { name: "Search" });
  }
}
