import http from "k6/http";
import { check, sleep } from "k6";
import {
  API,
  BASE,
  PASSWORD,
  authHeaders,
  register,
  seedProduct,
  CATALOG,
} from "./lib/api.js";
import { makeHandleSummary } from "./lib/summary.js";

/**
 * Smoke test — 1 VU, 60s, safe against the stock compose stack.
 *
 * The API rate-limits at RATE_LIMIT_PUBLIC=100/minute per client IP and every
 * k6 VU shares one IP, so this profile is paced to stay under it:
 * 8 requests/iteration x ~9 iterations/minute ≈ 75 req/min.
 *
 * Purpose: prove every hot path answers correctly and within relaxed SLOs
 * before any load is applied. Run: perf/run.sh smoke
 */
export const options = {
  vus: 1,
  duration: "60s",
  thresholds: {
    checks: ["rate==1"],
    http_req_failed: ["rate<0.01"],
    "http_req_duration{name:health}": ["p(95)<200"],
    "http_req_duration{name:products-list}": ["p(95)<400"],
    "http_req_duration{name:product-detail}": ["p(95)<400"],
    "http_req_duration{name:search-lexical}": ["p(95)<500"],
    // Semantic/hybrid encode the query with MiniLM per request — CPU-bound.
    "http_req_duration{name:search-semantic}": ["p(95)<1500"],
    "http_req_duration{name:search-hybrid}": ["p(95)<1500"],
    // Login is dominated by the deliberate bcrypt work factor.
    "http_req_duration{name:login}": ["p(95)<1000"],
  },
};

export function setup() {
  const merchant = register("perf-smoke-merchant", "merchant");
  const product = seedProduct(merchant.token, CATALOG[0]);
  const user = register("perf-smoke-user");
  return { product, email: user.email };
}

export default function (data) {
  const health = http.get(`${BASE}/health`, { tags: { name: "health" } });
  check(health, { "health 200": (r) => r.status === 200 });

  const list = http.get(`${API}/products?page_size=20`, { tags: { name: "products-list" } });
  check(list, {
    "list 200": (r) => r.status === 200,
    "list has items": (r) => (r.json("items") || []).length > 0,
  });

  const detail = http.get(`${API}/products/${data.product.id}`, {
    tags: { name: "product-detail" },
  });
  check(detail, { "detail 200": (r) => r.status === 200 });

  for (const mode of ["lexical", "semantic", "hybrid"]) {
    const res = http.get(`${API}/products/search?q=coffee%20mug&mode=${mode}`, {
      tags: { name: `search-${mode}` },
    });
    check(res, { [`search ${mode} 200`]: (r) => r.status === 200 });
  }

  const login = http.post(
    `${API}/auth/login`,
    JSON.stringify({ email: data.email, password: PASSWORD }),
    { headers: { "Content-Type": "application/json" }, tags: { name: "login" } },
  );
  check(login, { "login 200": (r) => r.status === 200 });

  const cart = http.get(`${API}/cart`, {
    ...authHeaders(login.json("access_token")),
    tags: { name: "cart-get" },
  });
  check(cart, { "cart 200": (r) => r.status === 200 });

  sleep(5); // pacing: keeps the single-IP request rate under 100/minute
}

export const handleSummary = makeHandleSummary();
