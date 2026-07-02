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

/** Create an active product owned by a fresh merchant; returns its title + id. */
export async function seedProduct(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; title: string }> {
  const token = await registerUser(request, {
    email: uniqueEmail("e2e-merchant"),
    role: "merchant",
  });
  // Date.now() alone collides when parallel workers seed in the same ms.
  const title = `E2E Ceramic Mug ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const res = await request.post(`${API}/products`, {
    headers: { Authorization: `Bearer ${token}` },
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
  return { id: body.id as string, title: body.title as string };
}
