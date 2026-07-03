import http from "k6/http";
import { check } from "k6";

/**
 * Backend API helpers for the k6 suite — mirrors e2e/helpers/api.ts:
 * test data is arranged through the API so the measured scenarios only
 * time the requests under test.
 */
export const BASE = __ENV.K6_BASE_URL || "http://localhost:8000";
export const API = `${BASE}/api/v1`;

export const PASSWORD = "Perf-Passw0rd!123";

const JSON_HEADERS = { "Content-Type": "application/json" };

export function uniqueEmail(prefix) {
  // NB: not `.local`/`.test` — Pydantic's EmailStr rejects special-use TLDs (422).
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e.com`;
}

export function authHeaders(token, extra = {}) {
  return { headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}`, ...extra } };
}

/** Register a user (setup-phase only); returns { token, email }. */
export function register(prefix, role) {
  const email = uniqueEmail(prefix);
  const res = http.post(
    `${API}/auth/register`,
    JSON.stringify({
      email,
      password: PASSWORD,
      full_name: "Perf User",
      ...(role === "merchant" ? { role: "merchant" } : {}),
    }),
    { headers: JSON_HEADERS, tags: { name: "setup" } },
  );
  check(res, { "setup: register 201": (r) => r.status === 201 });
  if (res.status !== 201) {
    throw new Error(`register ${prefix} failed: ${res.status} ${res.body}`);
  }
  return { token: res.json("access_token"), email };
}

/** Create an active product with deep stock so checkout never exhausts it. */
export function seedProduct(merchantToken, item) {
  const res = http.post(
    `${API}/products`,
    JSON.stringify({
      title: `${item.title} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      description: item.description,
      price: item.price,
      stock_qty: 1000000,
      status: "active",
    }),
    { ...authHeaders(merchantToken), tags: { name: "setup" } },
  );
  check(res, { "setup: seed product 201": (r) => r.status === 201 });
  if (res.status !== 201) {
    throw new Error(`seed product failed: ${res.status} ${res.body}`);
  }
  return { id: res.json("id"), title: res.json("title") };
}

/**
 * Small catalog with distinct vocabulary so lexical search has exact tokens
 * to rank and semantic search has meaning to embed.
 */
export const CATALOG = [
  { title: "Ceramic Coffee Mug", description: "Hand-thrown stoneware mug for slow mornings", price: 18.5 },
  { title: "Insulated Steel Bottle", description: "Vacuum flask that keeps drinks cold all day", price: 24.0 },
  { title: "Linen Throw Blanket", description: "Soft woven blanket for the reading couch", price: 42.0 },
  { title: "Walnut Desk Organizer", description: "Solid wood tray for pens and paper clips", price: 31.0 },
  { title: "Trail Running Shoes", description: "Grippy lightweight shoes for muddy trails", price: 89.0 },
  { title: "Mechanical Keyboard", description: "Tactile switches with PBT keycaps", price: 129.0 },
  { title: "Yoga Mat", description: "Non-slip cork mat for daily practice", price: 35.0 },
  { title: "French Press", description: "Glass carafe brewer for rich coffee", price: 27.5 },
  { title: "Canvas Backpack", description: "Weatherproof daypack with laptop sleeve", price: 58.0 },
  { title: "Scented Soy Candle", description: "Cedar and vanilla candle in a glass jar", price: 14.0 },
  { title: "Wireless Earbuds", description: "Noise-isolating buds with charging case", price: 74.0 },
  { title: "Herb Garden Kit", description: "Basil, mint and thyme seeds with planter pots", price: 22.0 },
];

/** Queries matched to the catalog: exact tokens + paraphrases (semantic recall). */
export const SEARCH_TERMS = [
  "coffee mug",
  "vacuum flask",
  "cozy blanket",
  "wooden desk tray",
  "running shoes",
  "keyboard",
  "something to keep drinks cold",
  "gift for a coffee lover",
];
