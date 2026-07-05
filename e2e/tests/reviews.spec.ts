import { expect, test } from "@playwright/test";
import {
  registerUser,
  seedDeliveredOrderWithReview,
  seedProduct,
  uniqueEmail,
} from "../helpers/api";
import { ProductsPage } from "../pages/products.page";

test.describe("Reviews", () => {
  test("TC-22: a published review renders on the product detail page", async ({
    page,
    request,
  }) => {
    const products = new ProductsPage(page);
    let title: string;

    await test.step(
      "Arrange: purchase delivered + review published (via API — reviews are purchase-gated, UI is display-only)",
      async () => {
        const customerToken = await registerUser(request, { email: uniqueEmail("e2e-reviewer") });
        const seeded = await seedProduct(request);
        title = seeded.title;
        await seedDeliveredOrderWithReview(request, {
          customerToken,
          merchantToken: seeded.merchantToken,
          productId: seeded.id,
          rating: 5,
          comment: "Exactly as described — the E2E suite approves.",
        });
      },
    );

    await test.step("The detail page shows the rating and the comment", async () => {
      await products.goto(title);
      await products.cardLink(title).click();
      await expect(page.getByLabel("5 of 5 stars").first()).toBeVisible();
      await expect(page.getByText("Exactly as described — the E2E suite approves.")).toBeVisible();
    });
  });
});
