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

  test("TC-09: registering an already-used email shows an error", async ({ page, request }) => {
    const register = new RegisterPage(page);
    const email = uniqueEmail("e2e-dup");

    await test.step("Arrange: the email is already registered (via API)", async () => {
      await registerUser(request, { email });
    });

    await test.step("Register with the same email through the UI", async () => {
      await register.goto();
      await register.register(email, PASSWORD);
    });

    await test.step("Stays on /register with an announced error", async () => {
      await expect(page).toHaveURL(/\/register/);
      await expect(page.getByRole("alert")).toBeVisible();
    });
  });

  test("TC-10: a too-short password is rejected", async ({ page }) => {
    const register = new RegisterPage(page);

    await test.step("Submit a 5-character password", async () => {
      await register.goto();
      await register.register(uniqueEmail("e2e-shortpw"), "ab1!x");
    });

    await test.step("Registration does not complete", async () => {
      await expect(page).toHaveURL(/\/register/);
      await expect(new NavComponent(page).signOutButton).toHaveCount(0);
    });
  });

  test("TC-11: the session survives a page reload (refresh-cookie boot)", async ({ page }) => {
    const register = new RegisterPage(page);
    const nav = new NavComponent(page);

    await test.step("Arrange: signed in via the UI", async () => {
      await register.goto();
      await register.register(uniqueEmail("e2e-reload"), PASSWORD);
      await expect(nav.signOutButton).toBeVisible({ timeout: 15_000 });
    });

    await test.step("Reload — still signed in", async () => {
      await page.reload();
      await expect(nav.signOutButton).toBeVisible({ timeout: 15_000 });
    });
  });

  test("TC-12: /checkout is auth-gated and returns you there after login", async ({
    page,
    request,
  }) => {
    const login = new LoginPage(page);
    const email = uniqueEmail("e2e-guard");

    await test.step("Arrange: account exists (via API)", async () => {
      await registerUser(request, { email });
    });

    await test.step("Visiting /checkout signed-out redirects to login with next=", async () => {
      await page.goto("/checkout");
      await expect(page).toHaveURL(/\/login\?next=%2Fcheckout/);
    });

    await test.step("Signing in returns to /checkout", async () => {
      await login.login(email, PASSWORD);
      await expect(page).toHaveURL(/\/checkout/, { timeout: 15_000 });
    });
  });
});
