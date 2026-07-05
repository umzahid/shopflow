import http from "k6/http";
import { check } from "k6";
import { API, authHeaders, register, seedProduct, CATALOG, SEARCH_TERMS } from "./lib/api.js";
import { makeHandleSummary } from "./lib/summary.js";

/**
 * The three exact performance scenarios from PRD §6.4, each with its own
 * pass/fail thresholds. REQUIRES the rate-limit overlay (perf/docker-compose.perf.yml)
 * — see perf/README.md. Run: perf/run.sh prd-benchmarks
 *
 *   Product listing (GET /products)   100 VUs / 60s (ramp 30s)  p95<200ms err<0.1%
 *   Checkout (POST /orders/checkout)   20 VUs / 120s (ramp 60s)  p95<800ms err<1%
 *   Search (GET /products/search)      50 VUs / 60s (mixed)      p95<400ms err<0.5%
 *
 * Thresholds are scoped per-scenario via metric tags so each target is judged
 * independently. On a dev-laptop compose stack the tightest target (listing
 * p95<200ms @ 100 VUs) may not be met — that's reported honestly, not hidden.
 */
export const options = {
  scenarios: {
    listing: {
      executor: "ramping-vus",
      exec: "listing",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 100 },
        { duration: "60s", target: 100 },
        { duration: "10s", target: 0 },
      ],
    },
    checkout: {
      executor: "ramping-vus",
      exec: "checkout",
      startVUs: 0,
      stages: [
        { duration: "60s", target: 20 },
        { duration: "120s", target: 20 },
        { duration: "10s", target: 0 },
      ],
    },
    search: {
      executor: "ramping-vus",
      exec: "search",
      startVUs: 0,
      stages: [
        { duration: "15s", target: 50 },
        { duration: "60s", target: 50 },
        { duration: "10s", target: 0 },
      ],
    },
  },
  thresholds: {
    "http_req_duration{scenario:listing}": ["p(95)<200"],
    "http_req_failed{scenario:listing}": ["rate<0.001"],
    "http_req_duration{scenario:checkout}": ["p(95)<800"],
    "http_req_failed{scenario:checkout}": ["rate<0.01"],
    "http_req_duration{scenario:search}": ["p(95)<400"],
    "http_req_failed{scenario:search}": ["rate<0.005"],
  },
};

const SHOPPERS = 20;

export function setup() {
  const merchant = register("perf-prd-merchant", "merchant");
  const products = CATALOG.map((item) => seedProduct(merchant.token, item));
  const tokens = [];
  for (let i = 0; i < SHOPPERS; i++) tokens.push(register(`perf-prd-shopper-${i}`).token);
  return { products, tokens };
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function listing() {
  const res = http.get(`${API}/products?page_size=20`, { tags: { scenario: "listing" } });
  check(res, { "list 200": (r) => r.status === 200 });
}

export function search() {
  const mode = pick(["lexical", "semantic", "hybrid"]);
  const q = encodeURIComponent(pick(SEARCH_TERMS));
  const res = http.get(`${API}/products/search?q=${q}&mode=${mode}`, { tags: { scenario: "search" } });
  check(res, { "search 200": (r) => r.status === 200 });
}

export function checkout(data) {
  const token = data.tokens[(__VU - 1) % data.tokens.length];
  // Cart-add is prep (not tagged for the checkout threshold); only the checkout
  // POST carries the scenario:checkout tag that the p95 target judges.
  http.post(
    `${API}/cart/items`,
    JSON.stringify({ product_id: pick(data.products).id, qty: 1 }),
    { ...authHeaders(token), tags: { scenario: "checkout-prep" } },
  );
  const res = http.post(
    `${API}/orders/checkout`,
    JSON.stringify({
      shipping_address: { line1: "1 Perf St", city: "Islamabad", country: "PK", postal_code: "44000" },
    }),
    { ...authHeaders(token), tags: { scenario: "checkout" } },
  );
  check(res, { "checkout 201": (r) => r.status === 201 });
}

export const handleSummary = makeHandleSummary();
