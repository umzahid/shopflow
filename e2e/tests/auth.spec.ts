import { expect, test } from "@playwright/test";
import { PASSWORD, registerUser, uniqueEmail } from "../helpers/api";
import { LoginPage, RegisterPage } from "../pages/auth.page";
import { NavComponent } from "../pages/nav.page";

test.describe("Authentication", () => {
  test("TC-01: a new visitor can register and lands signed in", async ({ page }) => {
    const register = new RegisterPage(page);
    const nav = new NavComponent(page);
    const email = uniqueEmail("e2e-reg");

    await test.step("Open the registration page", async () => {
      await register.goto();
      await expect(register.heading).toBeVisible();
    });

    await test.step("Submit email + password", async () => {
      await register.register(email, PASSWORD);
    });

    await test.step("Redirected off /register and header shows Sign out", async () => {
      await expect(page).not.toHaveURL(/\/register/);
      await expect(nav.signOutButton).toBeVisible();
    });
  });

  test("TC-02: login with a wrong password stays on the page and shows an error", async ({
    page,
    request,
  }) => {
    const login = new LoginPage(page);
    const email = uniqueEmail("e2e-badpw");

    await test.step("Arrange: account exists (via API)", async () => {
      await registerUser(request, { email });
    });

    await test.step("Attempt login with a wrong password", async () => {
      await login.goto();
      await login.login(email, "Wrong-Password-1!");
    });

    await test.step("Still on /login, an error is announced, no Sign out in header", async () => {
      await expect(page).toHaveURL(/\/login/);
      await expect(page.getByRole("alert")).toBeVisible();
      await expect(new NavComponent(page).signOutButton).toHaveCount(0);
    });
  });

  test("TC-03: an existing user can sign in and sign out", async ({ page, request }) => {
    const login = new LoginPage(page);
    const nav = new NavComponent(page);
    const email = uniqueEmail("e2e-login");

    await test.step("Arrange: account exists (via API)", async () => {
      await registerUser(request, { email });
    });

    await test.step("Sign in through the UI", async () => {
      await login.goto();
      await login.login(email, PASSWORD);
      // Generous timeout: post-login redirect + header hydration on a cold app.
      await expect(nav.signOutButton).toBeVisible({ timeout: 15_000 });
    });

    await test.step("Sign out returns the header to the signed-out state", async () => {
      await nav.signOutButton.click();
      await expect(nav.signInLink).toBeVisible();
    });
  });
});
