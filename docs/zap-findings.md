# OWASP ZAP Findings & Analysis — ShopFlow

**Scans:** 2026-07-03, ZAP `stable` (Docker), against the local compose stack.

| Scan | Tool | Target | Result |
|---|---|---|---|
| API | `zap-api-scan.py` (OpenAPI import, 36 routes) | `http://localhost:8000` | **0 FAIL · 1 WARN · 118 PASS** |
| Frontend | `zap-baseline.py` (spider + passive) | `http://localhost:3000` | **0 FAIL · 10 WARN · 57 PASS** |

**No High or Critical findings on either scan.** ZAP baseline/api scans are
**passive + spider only** (no active attack payloads sent against our own
running stack), so this establishes the header/config posture and surface-level
hygiene — not injection resistance. Injection classes (SQLi, XSS, path
traversal, template injection, Log4Shell, etc.) show as PASS because the passive
rules found no *evidence*, and they are separately defended in code: SQLAlchemy
parameterized queries, Pydantic validation, RFC 7807 handlers. Active-scan and
authenticated coverage are noted as future work at the end.

Reproduce: `security/zap-scan.sh api` and `security/zap-scan.sh frontend`
(reports written to gitignored `security/reports/`).

> **Scan note:** the first run of both scans was throttled by the API's
> `RATE_LIMIT_PUBLIC=100/minute` (all traffic from one host IP → 429s), which
> corrupts ZAP's view of the app. Both scans were rerun with the
> `perf/docker-compose.perf.yml` rate-limit overlay active — the same
> single-IP constraint documented for k6 (Entry 31). Restore stock limits
> afterwards with `docker compose up -d backend`.

---

## Triage summary

| # | Finding | Surface | ZAP risk | Our disposition |
|---|---|---|---|---|
| F1 | Cross-Origin-Resource-Policy header missing | API | Low | **Fixed** — added `CORP: same-origin` |
| F2 | Missing anti-clickjacking (X-Frame-Options/CSP frame-ancestors) | Frontend | Medium | Real — deferred to a frontend hardening pass (backend already sends it) |
| F3 | X-Content-Type-Options missing | Frontend | Low | Real — same frontend hardening pass |
| F4 | Content-Security-Policy not set | Frontend | Medium | Real — deferred; needs a Next.js-aware policy (nonces for inline scripts) |
| F5 | Permissions-Policy not set | Frontend | Low | Real — same hardening pass |
| F6 | Cross-Origin-Embedder-Policy missing | Frontend | Low | Accepted — COEP breaks Next chunk/font loading; not needed without cross-origin isolation |
| F7 | `X-Powered-By` / server info leak | Frontend | Low | Real — strip Next's `X-Powered-By` |
| F8 | "Dangerous JS functions" in bundles | Frontend | Low | **False positive** — framework/minifier `eval`-pattern matches |
| F9 | Suspicious comments in JS | Frontend | Info | **False positive** — minified vendor bundle tokens |
| F10 | Timestamp / Unix-time disclosure | Frontend | Low | **False positive** — cache-busting `?v=` build stamp, not sensitive |
| F11 | Non-storable content / cacheability | Frontend | Info | Accepted — correct for authenticated/dynamic responses |

---

## Detail & rationale

### F1 — Cross-Origin-Resource-Policy header missing *(API — Low — FIXED)*
The only API-scan finding. ZAP flagged `/openapi.json`, `/health`, `/metrics`,
and `/api/v1/auth/logout` as lacking CORP. Our API responses are consumed only
by our own origin's `fetch()`, so `same-origin` is the correct value and blocks
other sites from embedding responses as no-cors resources.
**Fixed** in `app/main.py` `security_headers` middleware — verified live:
`cross-origin-resource-policy: same-origin` now on every API response. This
takes the API scan to **0 WARN**.

The API already passed every header rule that matters most on a JSON API:
X-Content-Type-Options, X-Frame-Options, Referrer-Policy are set and the
`Server` header is stripped (all confirmed PASS).

### F2–F5, F7 — Frontend security headers missing *(Real — deferred)*
The **backend** sets a strong header set; the **Next.js frontend does not** —
it serves the storefront HTML with none of X-Frame-Options, CSP,
X-Content-Type-Options, or Permissions-Policy, and leaks `X-Powered-By: Next.js`.
These are genuine hardening gaps for the HTML surface (clickjacking + no CSP
are the two Medium items).

**Why deferred, not fixed now:** the correct fix is a `headers()` block (and
`poweredByHeader: false`) in `next.config.js`, and a *useful* CSP for a Next 14
app needs per-request nonces for its inline bootstrap scripts — a
`'unsafe-inline'` CSP would pass the scanner while providing little real
protection, which is worse than an honest TODO. This is scoped as a frontend
hardening pass (tracked in the test plan's future-work list) rather than a
scanner-silencing quick fix. Risk in the interim is low: dev-only HTTP on
localhost, no third-party embedding, backend enforces its own frame denial.

### F6 — Cross-Origin-Embedder-Policy missing *(Accepted)*
COEP is only meaningful when opting into cross-origin isolation
(`SharedArrayBuffer` etc.), which ShopFlow does not use. Enabling `require-corp`
would break Next.js chunk and web-font loading. Correctly absent.

### F8 — "Dangerous JS Functions" *(False positive)*
Flags `eval`/`Function`-like patterns inside `_next/static` bundles. These are
React/Next runtime and minifier artifacts, not application code calling `eval`
on user input. No app-authored dangerous sink; false positive.

### F9 — Suspicious comments *(False positive)*
Matched tokens (e.g. "FIXME"/"admin"-like strings) inside minified vendor
bundles — not developer comments leaking intent. False positive.

### F10 — Timestamp disclosure *(False positive)*
The "Unix timestamp" is the `?v=1783098595092` cache-busting query on static
assets — Next's build stamp, not a server-side secret or predictable token.

### F11 — Non-storable content / cacheability *(Accepted)*
ZAP notes some responses aren't cacheable. That is the intended behavior for
dynamic/authenticated pages; no action.

---

## What the scans confirm (the PASS story)

Both scans passed the rules that would indicate real exposure: no SQL injection
evidence, no reflected/persistent/DOM XSS, no path traversal, no source-code or
`.env` disclosure, no application-error leakage, no private-IP or cloud-metadata
exposure, no Log4Shell/Spring4Shell/Shellshock indicators, cookies carry
`SameSite`, and no session IDs in URLs. On the API, 118 rules passed.

## Limitations & future work

- **Passive + spider only.** No active injection payloads were sent. Add a ZAP
  full/active scan (`zap-full-scan.py`) against a disposable DB before relying
  on the injection-class PASS results.
- **Unauthenticated.** The scans never logged in, so merchant/admin endpoints
  and the authenticated attack surface (IDOR, privilege escalation, the copilot
  merchant-isolation boundary) are **not** covered here — merchant isolation is
  instead proven by two-merchant tests in the backend suite. Authenticated ZAP
  scanning with a session token is future work.
- **Frontend header pass** (F2–F5, F7) to land the `next.config.js` `headers()`
  + nonce-based CSP.
- **Production TLS/HSTS** is untested — dev runs HTTP; `COOKIE_SECURE` and HSTS
  belong to the production HTTPS profile documented in CLAUDE.md.
