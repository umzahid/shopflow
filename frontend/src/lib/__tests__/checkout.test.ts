import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the API layer BEFORE importing the module under test so the mock
// instance is the one imported by src/lib/checkout.ts.
vi.mock("@/lib/api", () => ({
  api: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

import { api } from "@/lib/api";
import { placeOrder, syncCartToServer } from "@/lib/checkout";

const mockedApi = api as ReturnType<typeof vi.fn>;

describe("syncCartToServer", () => {
  beforeEach(() => {
    mockedApi.mockReset();
    mockedApi.mockResolvedValue(undefined);
  });

  it("clears the server cart before pushing local lines", async () => {
    await syncCartToServer([
      { productId: "p1", qty: 2, title: "x", unitPrice: "1.00", imageUrl: null, stockQty: 5 },
      { productId: "p2", qty: 1, title: "y", unitPrice: "2.00", imageUrl: null, stockQty: 5 },
    ]);

    // First call is the DELETE to /cart
    expect(mockedApi).toHaveBeenNthCalledWith(1, "/cart", { method: "DELETE" });
    // Subsequent calls push each line
    expect(mockedApi).toHaveBeenNthCalledWith(2, "/cart/items", {
      method: "POST",
      body: { product_id: "p1", qty: 2 },
    });
    expect(mockedApi).toHaveBeenNthCalledWith(3, "/cart/items", {
      method: "POST",
      body: { product_id: "p2", qty: 1 },
    });
    expect(mockedApi).toHaveBeenCalledTimes(3);
  });

  it("makes only the DELETE call when the cart is empty", async () => {
    await syncCartToServer([]);
    expect(mockedApi).toHaveBeenCalledTimes(1);
    expect(mockedApi).toHaveBeenCalledWith("/cart", { method: "DELETE" });
  });
});

describe("placeOrder", () => {
  beforeEach(() => {
    mockedApi.mockReset();
  });

  it("POSTs the checkout body to /orders/checkout", async () => {
    const fakeOrder = { id: "ord_1", status: "confirmed" };
    mockedApi.mockResolvedValueOnce(fakeOrder);

    const req = {
      shipping_address: {
        line1: "1 St",
        line2: null,
        city: "Karachi",
        state: null,
        postal_code: "75500",
        country: "PK",
      },
      coupon_code: "SAVE10",
    };
    const result = await placeOrder(req);

    expect(mockedApi).toHaveBeenCalledWith("/orders/checkout", {
      method: "POST",
      body: req,
    });
    expect(result).toEqual(fakeOrder);
  });

  it("propagates errors from the api layer", async () => {
    mockedApi.mockRejectedValueOnce(new Error("boom"));
    await expect(
      placeOrder({
        shipping_address: {
          line1: "x",
          line2: null,
          city: "x",
          state: null,
          postal_code: "x",
          country: "PK",
        },
      }),
    ).rejects.toThrow("boom");
  });
});
