# Bug Reports — ShopFlow

Four real defects found and fixed during the project, written up in standard
bug-report format (Entry 34). Each was discovered by a different QE activity —
live endpoint sweep, dependency upgrade testing, adversarial config review,
and security review — which is the point: no single test layer catches them all.

Severity scale: **Critical** = outage/data loss · **High** = major feature broken
or deploy blocker · **Medium** = degraded behavior with workaround · **Low** = cosmetic.

---

## BUG-001 — Missing `ANTHROPIC_API_KEY` returns a raw 500 instead of RFC 7807 503

| Field | Value |
|---|---|
| **ID** | BUG-001 |
| **Severity** | Medium · **Priority:** High |
| **Component** | Backend — `app/services/copilot.py`, `app/services/descriptions.py` |
| **Environment** | Any deployment without `ANTHROPIC_API_KEY` set (fresh `.env`, CI, free-tier box) |
| **Found by** | Live endpoint sweep, 2026-07-02 |
| **Status** | Fixed — `dcebff0` |

**Steps to reproduce**
1. Start the stack with `ANTHROPIC_API_KEY` unset and `SHOPFLOW_FAKE_COPILOT` not set.
2. Log in as a merchant; call `POST /api/v1/merchant/copilot` with any question.

**Expected:** A structured RFC 7807 error telling the operator the feature is
not configured — every other error in the API follows that contract.

**Actual:** HTTP 500 with the generic unhandled-exception body. Logs show a
`TypeError` from inside the Anthropic SDK constructor.

**Root cause:** The SDK raises `TypeError` at client-construction time when the
key is `None`. The service's error handling caught `APIStatusError` /
`APIConnectionError` — exceptions that occur *after* a request is made — so a
config error at build time bypassed all of it and fell through to the global
500 handler.

**Fix:** `_get_client()` now guards explicitly: no key → `CopilotError(..., 503)`
→ RFC 7807 `503 "The copilot is not configured on this deployment."` Same guard
added to the description generator.

**Lesson:** Error handling scoped to "the API call failed" misses the class of
errors that happen before the call exists. Config validation belongs at the
boundary, not inside the retry/except chain.

---

## BUG-002 — bcrypt 5.x upgrade silently breaks all authentication

| Field | Value |
|---|---|
| **ID** | BUG-002 |
| **Severity** | Critical · **Priority:** Critical |
| **Component** | Backend — `app/core/security.py` (passlib 1.7.4 + bcrypt) |
| **Environment** | Any environment after an unpinned `pip install` pulls bcrypt ≥ 5.0 |
| **Found by** | Dependency install during Week 1 setup |
| **Status** | Fixed — pin `bcrypt==4.0.1` in `requirements.txt` (see PROMPT_LOG Entry 1); documented in CLAUDE.md as do-not-change |

**Steps to reproduce**
1. Install dependencies with bcrypt resolved to 5.x alongside `passlib==1.7.4`.
2. Register a user, then attempt to log in with the correct password.

**Expected:** Login succeeds.

**Actual:** All logins fail. No exception surfaces at request time — hashing
appears to "work," verification just returns false.

**Root cause:** At import, passlib 1.7.4 runs an internal self-test for a
historical bcrypt wrap bug using a 200-byte password. bcrypt 5.x removed
tolerance for >72-byte inputs, so the self-test errors, passlib degrades, and
hash/verify behavior breaks silently. passlib is unmaintained and will not ship
a fix.

**Fix:** Pin `bcrypt==4.0.1`. The pin is documented in `CLAUDE.md` and
`requirements.txt` so a routine dependency bump can't reintroduce it.

**Lesson:** The worst dependency breakages are the silent ones. An auth
round-trip test (register → login) in CI is the tripwire; ours fails loudly if
the pin is ever lost.

---

## BUG-003 — Frontend liveness probe points at a route that doesn't exist (would CrashLoop)

| Field | Value |
|---|---|
| **ID** | BUG-003 |
| **Severity** | High (deploy blocker) · **Priority:** High |
| **Component** | Infrastructure — `k8s/frontend.yaml` |
| **Environment** | Any Kubernetes deploy of the manifests as originally written |
| **Found by** | Adversarial whole-feature review of the k8s manifests (E21), verified against the live app |
| **Status** | Fixed — `9bb9ef2` |

**Steps to reproduce**
1. Review `k8s/frontend.yaml` as first drafted: liveness/readiness probes hit `GET /api/health`.
2. Against the running frontend: `curl -i http://localhost:3000/api/health`.

**Expected:** 200 — a probe path must exist for the pod to be considered alive.

**Actual:** 404. The Next.js app has no `/api/health` route (the *backend*
has `/health`; the probe path was copied across). In a cluster, kubelet would
mark the container unhealthy and restart it forever — CrashLoopBackOff on an
app that works perfectly.

**Root cause:** Probe configuration written by analogy with the backend
manifest instead of verified against the frontend's actual routes. Nothing
validates probe paths offline — `kubeconform` checks schema, not semantics.

**Fix:** Probes now hit `/` (the storefront home, always routable). Verified
live before committing the fix.

**Lesson:** Manifest review must include "does this URL actually exist?" —
schema-valid manifests can still encode a guaranteed outage. Cheap to check
(one curl), expensive to discover in-cluster.

---

## BUG-004 — Default-deny NetworkPolicy actually allowed ingress from every namespace

| Field | Value |
|---|---|
| **ID** | BUG-004 |
| **Severity** | High (security) · **Priority:** High |
| **Component** | Infrastructure — `k8s/networkpolicy.yaml` |
| **Environment** | Any Kubernetes deploy of the manifests as originally written |
| **Found by** | Security-focused review pass on the k8s manifests (E21) |
| **Status** | Fixed — `9bb9ef2` |

**Steps to reproduce**
1. Review the original ingress rule intended to admit ALB traffic: it used `namespaceSelector: {}`.
2. Deploy any pod in *any other namespace* and curl the backend service.

**Expected:** Denied — the design is default-deny with a narrow allowance for
load-balancer traffic only.

**Actual:** Allowed. `namespaceSelector: {}` matches **all namespaces**, so the
"default-deny" posture had an allow-everyone hole exactly where it mattered.

**Root cause:** With `aws-load-balancer-controller` in `target-type: ip` mode,
ALB traffic arrives from ENI IPs — not from pods with a labelable namespace.
`{}` was used as "whatever the ALB is," but in NetworkPolicy semantics an empty
selector means *match everything*.

**Fix:** Replaced with an `ipBlock` scoped to the VPC CIDR — admits the ALB's
ENI traffic, excludes cluster-external sources, and no longer whitelists every
namespace.

**Lesson:** Empty selectors are the `SELECT *` of NetworkPolicy. Security
manifests deserve an adversarial read where each rule is challenged with
"what *else* does this match?"

---

## Where the rest of the material lives

These four are the write-ups; the debugging journals in `PROMPT_LOG.md`
(Entries 21, 25, 28, 30, 31) record more in the same spirit — Pydantic
`EmailStr` rejecting `.local` test domains, review text silently dropped when
posted under the wrong field name (Pydantic ignores unknown keys), the MiniLM
cold-load outlier in perf runs, and the LightGBM `libgomp1` import crash in
slim Docker images.
