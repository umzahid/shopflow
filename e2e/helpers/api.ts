import { APIRequestContext, expect } from "@playwright/test";

/**
 * Backend API helpers — test data setup goes through the API so the UI tests
 * only exercise the UI behavior under test (standard API-arrange/UI-act split).
 */
const API = process.env.E2E_API_URL ?? "http://localhost:8000/api/v1";

export function uniqueEmail(prefix: string): string {
  // NB: not `.local`/`.test` — Pydantic's EmailStr rejects special-use TLDs (422).
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e.com`;
}

export const PASSWORD = "E2e-Passw0rd!123";

export async function registerUser(
  request: APIRequestContext,
  opts: { email: string; role?: "customer" | "merchant" },
): Promise<string> {
  const res = await request.post(`${API}/auth/register`, {
    data: {
      email: opts.email,
      password: PASSWORD,
      full_name: "E2E User",
      ...(opts.role === "merchant" ? { role: "merchant" } : {}),
    },
  });
  expect(res.status(), `register ${opts.email}`).toBe(201);
  return (await res.json()).access_token as string;
}

/** Create an active product owned by a fresh merchant; returns title/id + the merchant's token. */
export async function seedProduct(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; title: string; merchantToken: string }> {
  const merchantToken = await registerUser(request, {
    email: uniqueEmail("e2e-merchant"),
    role: "merchant",
  });
  // Date.now() alone collides when parallel workers seed in the same ms.
  const title = `E2E Ceramic Mug ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const res = await request.post(`${API}/products`, {
    headers: { Authorization: `Bearer ${merchantToken}` },
    data: {
      title,
      description: "Hand-thrown ceramic mug seeded by the E2E suite",
      price: 18.5,
      stock_qty: 12,
      status: "active",
      ...overrides,
    },
  });
  expect(res.status(), "seed product").toBe(201);
  const body = await res.json();
  return { id: body.id as string, title: body.title as string, merchantToken };
}

/**
 * API-only arrange for the review scenario: buy the product as the customer,
 * walk the order to `delivered` as the owning merchant, then publish a review.
 * (Reviews are purchase-gated server-side; the UI is display-only.)
 */
export async function seedDeliveredOrderWithReview(
  request: APIRequestContext,
  opts: {
    customerToken: string;
    merchantToken: string;
    productId: string;
    rating: number;
    comment: string;
  },
): Promise<void> {
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  const add = await request.post(`${API}/cart/items`, {
    headers: auth(opts.customerToken),
    data: { product_id: opts.productId, qty: 1 },
  });
  expect(add.status(), "cart add").toBe(201);

  const checkout = await request.post(`${API}/orders/checkout`, {
    headers: auth(opts.customerToken),
    data: {
      shipping_address: { line1: "1 E2E St", city: "Islamabad", country: "PK", postal_code: "44000" },
    },
  });
  expect(checkout.status(), "checkout").toBe(201);
  const orderId = (await checkout.json()).id as string;

  for (const status of ["confirmed", "shipped", "delivered"]) {
    const res = await request.patch(`${API}/orders/${orderId}/status`, {
      headers: auth(opts.merchantToken),
      data: { status },
    });
    expect(res.status(), `order -> ${status}`).toBe(200);
  }

  // NB: the field is `body` — Pydantic ignores unknown keys, so a wrong name
  // still 201s but the text is silently dropped.
  const review = await request.post(`${API}/products/${opts.productId}/reviews`, {
    headers: auth(opts.customerToken),
    data: { rating: opts.rating, body: opts.comment },
  });
  expect(review.status(), "post review").toBe(201);
}
