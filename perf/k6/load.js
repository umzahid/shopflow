import http from "k6/http";
import { check, sleep } from "k6";
import { Counter } from "k6/metrics";
import {
  API,
  authHeaders,
  register,
  seedProduct,
  CATALOG,
  SEARCH_TERMS,
} from "./lib/api.js";
import { makeHandleSummary } from "./lib/summary.js";

/**
 * Load test — mixed browse + shop traffic against the compose stack.
 *
 * REQUIRES the perf overlay (raises RATE_LIMIT_PUBLIC — see perf/README.md):
 *   docker compose -f docker-compose.yml -f docker-compose.override.yml \
 *     -f perf/docker-compose.perf.yml up -d backend
 * Against the stock 100/min-per-IP limit every request past the first ~100
 * would 429 (all VUs share the host IP) and http_req_failed fails the run.
 *
 * Scenarios (~4.5 min total):
 *   browse — anonymous: list -> detail -> search (rotating mode). 0->15 VUs.
 *   shop   — authenticated: cart add -> ~30% proceed to checkout (live
 *            fraud scoring on every order). 0->5 VUs.
 *
 * Thresholds are draft SLOs for a dev laptop, not production numbers.
 */
export const options = {
  scenarios: {
    browse: {
      executor: "ramping-vus",
      exec: "browse",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 15 },
        { duration: "2m", target: 15 },
        { duration: "1m", target: 25 }, // short push past steady state
        { duration: "30s", target: 0 },
      ],
    },
    shop: {
      executor: "ramping-vus",
      exec: "shop",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 5 },
        { duration: "3m", target: 5 },
        { duration: "30s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
    "http_req_duration{name:products-list}": ["p(95)<600"],
    "http_req_duration{name:product-detail}": ["p(95)<500"],
    "http_req_duration{name:search-lexical}": ["p(95)<800"],
    // Semantic/hybrid encode the query with MiniLM per request — CPU-bound,
    // so these degrade first as VUs contend for cores.
    "http_req_duration{name:search-semantic}": ["p(95)<2500"],
    "http_req_duration{name:search-hybrid}": ["p(95)<2500"],
    "http_req_duration{name:cart-add}": ["p(95)<800"],
    // Checkout = transaction + stock decrement + LightGBM fraud scoring.
    "http_req_duration{name:checkout}": ["p(95)<3000"],
  },
};

const ordersPlaced = new Counter("orders_placed");
const ordersFlagged = new Counter("orders_flagged_for_review");

const SHOPPER_POOL = 10; // registered up-front; JWTs live 15 min > test length

export function setup() {
  const merchant = register("perf-load-merchant", "merchant");
  const products = CATALOG.map((item) => seedProduct(merchant.token, item));
  const tokens = [];
  for (let i = 0; i < SHOPPER_POOL; i++) {
    tokens.push(register(`perf-load-shopper-${i}`).token);
  }
  return { products, tokens };
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function browse(data) {
  const list = http.get(`${API}/products?page_size=20`, { tags: { name: "products-list" } });
  check(list, { "list 200": (r) => r.status === 200 });

  const detail = http.get(`${API}/products/${pick(data.products).id}`, {
    tags: { name: "product-detail" },
  });
  check(detail, { "detail 200": (r) => r.status === 200 });

  const mode = pick(["lexical", "semantic", "hybrid"]);
  const q = encodeURIComponent(pick(SEARCH_TERMS));
  const search = http.get(`${API}/products/search?q=${q}&mode=${mode}`, {
    tags: { name: `search-${mode}` },
  });
  check(search, { "search 200": (r) => r.status === 200 });

  sleep(1 + Math.random() * 2); // think time
}

export function shop(data) {
  // VU numbers are globally unique across scenarios; stable token per VU so
  // each shopper keeps one cart and carts never race across VUs.
  const token = data.tokens[(__VU - 1) % data.tokens.length];

  const add = http.post(
    `${API}/cart/items`,
    JSON.stringify({ product_id: pick(data.products).id, qty: 1 + Math.floor(Math.random() * 3) }),
    { ...authHeaders(token), tags: { name: "cart-add" } },
  );
  check(add, { "cart add 201": (r) => r.status === 201 });

  if (Math.random() < 0.3) {
    const res = http.post(
      `${API}/orders/checkout`,
      JSON.stringify({
        shipping_address: {
          line1: "1 Perf St",
          city: "Islamabad",
          country: "PK",
          postal_code: "44000",
        },
      }),
      { ...authHeaders(token), tags: { name: "checkout" } },
    );
    check(res, { "checkout 201": (r) => r.status === 201 });
    if (res.status === 201) {
      ordersPlaced.add(1);
      if (res.json("status") === "pending_review") {
        ordersFlagged.add(1);
      }
    }
  }

  sleep(2 + Math.random() * 2); // think time
}

export const handleSummary = makeHandleSummary();
