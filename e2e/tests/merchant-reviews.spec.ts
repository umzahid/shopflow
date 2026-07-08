import { expect, test } from "@playwright/test";
import {
  PASSWORD,
  registerUser,
  seedDeliveredOrderWithReview,
  uniqueEmail,
} from "../helpers/api";
import { LoginPage } from "../pages/auth.page";

const API = process.env.E2E_API_URL ?? "http://localhost:8000/api/v1";

test.describe("Review lifecycle — merchant leg (PRD scenario 31)", () => {
  test("TC-28: merchant sees a customer's review in the dashboard", async ({
    page,
    request,
  }) => {
    const merchantEmail = uniqueEmail("e2e-rev-merchant");
    const comment = "Five stars from the E2E suite — scenario 31.";
    let productTitle: string;

    await test.step(
      "Arrange via API: merchant + product + delivered purchase + published review",
      async () => {
        const merchantToken = await registerUser(request, {
          email: merchantEmail,
          role: "merchant",
        });
        productTitle = `E2E Reviewed Vase ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
        const created = await request.post(`${API}/products`, {
          headers: { Authorization: `Bearer ${merchantToken}` },
          data: {
            title: productTitle,
            description: "Hand-thrown vase for the review-lifecycle scenario",
            price: 42.0,
            stock_qty: 5,
            status: "active",
          },
        });
        expect(created.status(), "seed product").toBe(201);
        const customerToken = await registerUser(request, {
          email: uniqueEmail("e2e-rev-customer"),
        });
        await seedDeliveredOrderWithReview(request, {
          customerToken,
          merchantToken,
          productId: (await created.json()).id as string,
          rating: 5,
          comment,
        });
      },
    );

    await test.step("Merchant logs in through the UI", async () => {
      const login = new LoginPage(page);
      await login.goto();
      await login.login(merchantEmail, PASSWORD);
      await page.waitForURL((u) => !u.pathname.startsWith("/login"));
    });

    await test.step("Dashboard's recent-reviews card shows the review", async () => {
      await page.goto("/merchant");
      const card = page.getByTestId("recent-reviews");
      await expect(card.getByText(comment)).toBeVisible();
      await expect(card.getByText(productTitle)).toBeVisible();
      await expect(card.getByLabel("5 out of 5 stars").first()).toBeVisible();
    });
  });
});
