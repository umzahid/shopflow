import { Locator, Page } from "@playwright/test";

/** /login — labels Email/Password, submit "Sign in". */
export class LoginPage {
  readonly heading: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly createAccountLink: Locator;

  constructor(readonly page: Page) {
    this.heading = page.getByRole("heading", { name: "Sign in" });
    this.emailInput = page.getByLabel("Email");
    this.passwordInput = page.getByLabel("Password");
    this.submitButton = page.getByRole("button", { name: "Sign in" });
    this.createAccountLink = page.getByRole("link", { name: "Create an account" });
  }

  async goto() {
    await this.page.goto("/login");
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}

/** /register — labels Email/Password, submit "Create account". */
export class RegisterPage {
  readonly heading: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;

  constructor(readonly page: Page) {
    this.heading = page.getByRole("heading", { name: "Create account" });
    this.emailInput = page.getByLabel("Email");
    this.passwordInput = page.getByLabel("Password");
    this.submitButton = page.getByRole("button", { name: "Create account" });
  }

  async goto() {
    await this.page.goto("/register");
  }

  async register(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}
