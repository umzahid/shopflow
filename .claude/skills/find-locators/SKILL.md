---
name: find-locators
description: Discover and maintain Playwright locators for the E2E suite by driving a real browser through the Playwright MCP server — navigate to a page, snapshot its accessibility tree, derive robust locators, and write them into e2e/pages/*.page.ts. Use when adding E2E coverage for a new page/flow, when a spec fails with a locator/strict-mode error, or when the UI changes. Args: page route(s) or flow to map (e.g. "/products", "checkout flow").
---

# find-locators — browser-driven locator discovery for the E2E suite

Maintains the page objects in `e2e/pages/`. Locators must come from the **real
rendered DOM**, never guessed from component names.

## Prerequisites

1. The stack is running: `docker compose up -d` → frontend at `http://localhost:3000`.
2. The Playwright MCP server is connected. Check with ToolSearch for
   `browser_navigate` / `browser_snapshot`. If absent, tell the user to run:

   ```bash
   claude mcp add playwright -- npx "@playwright/mcp@latest"
   ```

   and restart the session. If MCP cannot be added, use the **fallback** below.

## Workflow

For each page/flow in the requested scope:

1. **Navigate**: `browser_navigate` to the route (e.g. `http://localhost:3000/products`).
2. **Snapshot**: `browser_snapshot` — returns the accessibility tree
   (post-hydration, so client-rendered content like `/cart` and `/checkout` is
   visible — this is why the browser path beats fetching SSR HTML).
3. **Reach stateful UI when needed**: some elements only exist in a state —
   e.g. cart line items require an item in the cart; checkout requires auth.
   Drive there with `browser_type` / `browser_click` (register a throwaway
   `e2e-<timestamp>@test.local` account, add a product), then re-snapshot.
4. **Derive locators** from the snapshot, in strict priority order:
   1. `getByRole(role, { name })` — from the a11y tree's role+name
   2. `getByLabel(...)` — form fields with `<label>`/aria-label
   3. `getByPlaceholder(...)`
   4. `getByText(...)` — last resort for non-interactive anchors
   5. CSS (`[name="email"]`) — only when none of the above are unique

   Rules:
   - Never `nth()`, positional CSS, or generated ids (Radix/React ids like
     `:Ri6jsqj6:` change between renders).
   - Parameterized aria-labels (`Remove ${title} from cart`,
     `Increase quantity of ${title}`) become **functions** on the page object
     taking the product title.
   - If a locator resolves to >1 element (strict-mode violation), scope it
     through a container locator, don't index it.
5. **Write into the suite**: update the matching `e2e/pages/<page>.page.ts`
   (create from the existing pattern if new). Keep locators as readonly fields
   or parameterized methods; no test logic in page objects.
6. **Verify**: `cd e2e && npx playwright test --list` must compile. If the
   change touched existing locators, run the affected spec:
   `npx playwright test tests/<spec> --reporter=line`.

## Fallback (no Playwright MCP available)

Two sources, both weaker than a live snapshot — say so in the report:

- **SSR fetch** for server-rendered pages: `curl http://localhost:3000/<route>`
  and parse interactive elements (tag/type/name/placeholder/aria-label/text).
- **Component source** for client-rendered pages (`/cart`, `/checkout`,
  anything behind AuthGuard): grep `frontend/src/app/<route>/page.tsx` and its
  components for `aria-label=`, `label=`, `placeholder=`, and button text.

Cross-check both when possible; verify against the live page once the suite runs.

## Current locator inventory (2026-07-02 baseline)

Derived from the live app; see `e2e/pages/*.page.ts` for the authoritative set.
Header: brand link "ShopFlow", buttons "Open cart"/"Toggle theme", "Sign in"
link ↔ "Sign out" button (AuthMenu, signed-in indicator). Login/Register:
labels Email/Password, submit "Sign in"/"Create account". Products: h1 "All
products", "Minimum price"/"Maximum price", "Sort by" select, Apply/Reset.
Product card: `View ${title}` / `Add ${title} to cart`. Detail: "Quantity",
"Add to cart". Cart: `Quantity for/Increase/Decrease quantity of/Remove ${title}
from cart`, "Coupon code" input, "Proceed to checkout". Checkout: labels Street
address/City/Postal code/Country (ISO code), submit "Place order" →
`/orders/{id}`.
