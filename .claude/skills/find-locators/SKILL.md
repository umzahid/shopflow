---
name: find-locators
description: Connect to the Playwright MCP server, open a live browser session against the running ShopFlow stack, discover locators from the real rendered DOM, and write them into the E2E page objects (e2e/pages/*.page.ts). Use when adding E2E coverage for a new page/flow, when a spec fails with a locator or strict-mode error, or after any UI change. Args: route(s) or flow to map (e.g. "/products", "checkout flow", "cart line controls").
---

# find-locators — MCP browser session → locators → automation suite

Maintains the page objects in `e2e/pages/`. Locators must come from the **real
rendered DOM** in a live browser, never guessed from component names.

## Step 1 — Connect to the Playwright MCP server

The server is configured **project-scoped** in `.mcp.json` at the repo root and
runs in Docker (`mcr.microsoft.com/playwright/mcp`, headless, `--network host`)
because this host has no node — do NOT switch it to `npx` without checking
`which node` first. `--network host` is required so the containerized browser
can reach the stack on `localhost:3000/8000` (same reason the E2E suite uses it;
see `e2e/README.md`).

1. Check the tools are loaded: `ToolSearch` for `browser_navigate` /
   `browser_snapshot`. Loaded → go to Step 2.
2. Not loaded → the server wasn't picked up this session. Verify `.mcp.json`
   exists and Docker is running, then ask the user to approve/enable the
   `playwright` MCP server (or restart the session — project MCP servers load
   at session start and may need a one-time approval prompt).
3. Still unavailable → use the **fallback** (last section), and say clearly in
   the report that locators came from the weaker path.

Core tools (names as of `@playwright/mcp` 0.0.x — re-discover with ToolSearch
if a call fails): `browser_navigate`, `browser_snapshot`, `browser_click`,
`browser_type`, `browser_fill_form`, `browser_press_key`, `browser_wait_for`,
`browser_take_screenshot`, `browser_console_messages`, `browser_close`.

## Step 2 — Open the session and reach the target state

1. Stack up? `curl -sf localhost:3000 >/dev/null` — if not:
   `docker compose up -d`.
2. `browser_navigate` to `http://localhost:3000<route>`.
3. `browser_snapshot` — returns the **accessibility tree** (each element with
   role, accessible name, and a ref id). This is post-hydration, so
   client-rendered pages (`/cart`, `/checkout`, anything behind AuthGuard) show
   their real content — the reason a live session beats fetching SSR HTML.
4. **Stateful UI needs state.** Elements that only exist in a state must be
   reached, not imagined:
   - signed-in header → register a throwaway account through the UI
     (`e2e-<epoch>@e.com` — NOT `.local`/`.test`; Pydantic EmailStr 422s
     special-use TLDs, see PROMPT_LOG Entry 30)
   - cart line controls → add a product first (seed one via the API if the
     catalog is empty: see `e2e/helpers/api.ts`)
   - checkout form → signed in + non-empty cart, then navigate to `/checkout`
   Drive there with `browser_click` / `browser_type` /
   `browser_fill_form`, then re-`browser_snapshot`.
5. If something looks wrong, `browser_take_screenshot` and
   `browser_console_messages` before concluding anything.

## Step 3 — Derive locators from the snapshot

Priority order — take the first that uniquely identifies the element:

1. `getByRole(role, { name })` — role + accessible name from the a11y tree
2. `getByLabel(...)` — labelled form fields
3. `getByPlaceholder(...)`
4. `getByText(...)` — last resort, non-interactive anchors only
5. CSS (`[name="email"]`) — only when none of the above are unique

Rules (each one has already bitten this suite — see Entry 30):

- **Never** `nth()`, positional CSS, or generated ids (`:Ri6jsqj6:`-style React
  ids change every render).
- **Substring collisions**: `{ name: "Your cart" }` also matches
  "Loading your cart…" — add `exact: true` when the name is a prefix of
  another accessible name on the page.
- **Parameterized aria-labels** (`Remove ${title} from cart`,
  `Increase quantity of ${title}`, `View ${title}`) become **functions** on the
  page object taking the product title — not hardcoded strings.
- A locator resolving to >1 element is a strict-mode failure: scope it through
  a container locator, never index it.

## Step 4 — Write into the automation suite

- One page object per route in `e2e/pages/<name>.page.ts`; follow the existing
  pattern (readonly `Locator` fields set in the constructor; parameterized
  locators as methods; **no test logic in page objects**).
- New page → also consider which spec in `e2e/tests/` should cover it and
  propose test cases (steps via `test.step()`).
- Add a dated note to the "Current locator inventory" section below when the
  UI meaningfully changes.

## Step 5 — Verify and close

1. Compile check: run in the suite's container —
   `docker run --rm --network host -v "$PWD/e2e":/work -w /work mcr.microsoft.com/playwright:v1.48.2-jammy npx playwright test --list`
2. If existing locators changed, run the affected spec(s) the same way with
   `--reporter=line`. Green before reporting done.
3. `browser_close` to end the MCP browser session.

## Fallback (MCP unavailable) — weaker, say so in the report

- **SSR fetch** for server-rendered pages: `curl http://localhost:3000/<route>`
  and parse interactive elements (tag/type/name/placeholder/aria-label/text).
- **Component source** for client-rendered pages: grep
  `frontend/src/app/<route>/page.tsx` (+ its components) for `aria-label=`,
  `label=`, `placeholder=`, and button text.
- Cross-check both; the passing suite is the final proof either way.

## Current locator inventory (2026-07-02 baseline — verified by 8/8 passing suite)

Authoritative set lives in `e2e/pages/*.page.ts`. Summary: header brand link
"ShopFlow", buttons "Open cart"/"Toggle theme", "Sign in" link ↔ "Sign out"
button (signed-in indicator). Login/Register: labels Email/Password, submits
"Sign in"/"Create account". Products: h1 "All products", "Minimum/Maximum
price", "Sort by", Apply/Reset; cards `View ${title}` / `Add ${title} to cart`.
Detail: "Quantity", "Increase/Decrease quantity", "Add to cart". Cart: heading
"Your cart" (**exact: true**), `Quantity for/Increase quantity of/Decrease
quantity of/Remove ${title} from cart`, "Coupon code", "Proceed to checkout".
Checkout: labels Street address/City (exact)/Postal code/Country (ISO code),
"Place order" → `/orders/{uuid}`. No `data-testid`s anywhere in the app.
