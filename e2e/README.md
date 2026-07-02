# ShopFlow E2E Automation Suite (Playwright)

**Domain 6, Entry 30.** UI end-to-end tests against the docker-compose stack.
Structure: page objects (`pages/`) hold locators only; specs (`tests/`) hold
step-structured test cases; test data is arranged through the API (`helpers/`)
so the UI layer only exercises what each case is actually about.

## Run

### Via Docker (no local node needed — how this repo runs it)

```bash
docker compose up -d      # stack: frontend :3000, backend :8000
docker run --rm --network host -v "$PWD/e2e":/work -w /work \
  mcr.microsoft.com/playwright:v1.48.2-jammy \
  bash -c "npm install --no-fund --no-audit && npx playwright test"
```

The image tag must match the pinned `@playwright/test` version (1.48.2).

**Why `--network host` (not `host.docker.internal`)**: the frontend's client
bundle bakes `NEXT_PUBLIC_API_URL` at build time and falls back to
`http://localhost:8000/api/v1` — so the *browser inside the container* must see
the host's localhost. Requires Docker Desktop host networking (4.34+). If
unavailable, rebuild the frontend image with a `NEXT_PUBLIC_API_URL` build-arg
pointing at `host.docker.internal` instead.

### With local node

```bash
cd e2e
npm install && npx playwright install chromium   # first time only
npm test                              # headless
npm run test:headed                   # watch it
npm run report                        # open the HTML report
```

Env overrides: `E2E_BASE_URL` (default `http://localhost:3000`),
`E2E_API_URL` (default `http://localhost:8000/api/v1`).

## Test cases

| ID | Case | Steps | Expected |
|---|---|---|---|
| TC-01 | Register | open /register → submit email+password | leaves /register; header shows **Sign out** |
| TC-02 | Login, wrong password | arrange account (API) → login with bad password | stays on /login; `role=alert` visible; not signed in |
| TC-03 | Login + logout | arrange account → sign in via UI → sign out | Sign out appears, then Sign in returns |
| TC-04 | Search | seed product (API) → search from home | results show the product card |
| TC-05 | Filter + detail | seed product → price filter includes/excludes → open detail | card appears/disappears with filter; detail add-to-cart enabled |
| TC-06 | Add to cart | detail page → qty 2 → add | cart lists line, qty 2 |
| TC-07 | Cart controls | arrange line → +/− stepper → remove | qty tracks stepper; line disappears on remove |
| TC-08 | Full purchase | sign in → add to cart → checkout form → place order | redirect to `/orders/{uuid}` (live fraud scoring on the way) |

## Locator maintenance — the `find-locators` workflow

Locators live **only** in `pages/*.page.ts` and were discovered from the real
rendered DOM, not guessed. To add or repair locators, run the project skill:

```
/find-locators <route or flow>     # e.g. /find-locators /products
```

The skill (`.claude/skills/find-locators/SKILL.md`) drives a real browser via
the **Playwright MCP server**, configured project-wide in `.mcp.json` (runs in
Docker — `mcr.microsoft.com/playwright/mcp`, headless, `--network host` — so no
local node is needed; approve the server once when Claude Code prompts):
navigate → accessibility snapshot → derive locators (`getByRole` > `getByLabel`
> `getByPlaceholder` > `getByText`; no nth/positional CSS; parameterized
aria-labels become functions) → write them into the page objects → verify with
`npx playwright test --list`. Without MCP it falls back to SSR fetch +
component-source analysis (weaker for client-rendered pages like /cart).

Known locator conventions in this app: no `data-testid`s; interactive elements
carry aria-labels, often parameterized per product title
(`Remove ${title} from cart`).
