# Kubernetes Manifests for EKS — Design Spec

**Date:** 2026-07-02
**Assignment task:** Domain 4 — Entry 21 (Kubernetes manifests for EKS)
**Status:** DRAFT — pending approval before implementation plan

## Purpose

Kubernetes manifests that deploy the ShopFlow application tier (FastAPI backend +
Next.js frontend) onto the EKS cluster from E18, fronted by an ALB Ingress.
Datastores (Postgres, Redis) are **not** in-cluster — they are managed AWS
services (RDS / ElastiCache, the future `database` module); the app reaches them
via connection strings injected from a Secret. Like E18/E20 this is **validated
manifest code**, not a live deploy — no cluster, verified offline with
`kubectl kustomize` + `kubeconform` (schema validation) in Docker.

## Decisions (proposed — confirm before plan)

- **Kustomize base under `k8s/`.** A `kustomization.yaml` ties the resources,
  sets the `shopflow` namespace and common labels, and exposes `images:` for
  tag/repo override. (Environment overlays are noted as a future extension; E21
  ships the base only.)
- **Two workloads:** `backend` (FastAPI, `:8000`, health `/health`) and
  `frontend` (Next.js, `:3000`, health `/api/health`) — ports/health paths taken
  from the running app + docker-compose.
- **ALB Ingress**, path-based: `/api` → backend, `/` → frontend. Uses
  `ingressClassName: alb` + `alb.ingress.kubernetes.io/*` annotations
  (`scheme=internet-facing`, `target-type=ip`, `healthcheck-path`, ssl-redirect).
  The **AWS Load Balancer Controller is a documented prerequisite** (installed via
  Helm/IRSA, out of scope for the manifests).
- **Security baked in** (ISO 27001 context): pod/container `securityContext`
  (`runAsNonRoot`, `runAsUser`, `allowPrivilegeEscalation: false`, drop ALL
  capabilities, `seccompProfile: RuntimeDefault`); CPU/memory requests+limits;
  readiness + liveness probes; a **default-deny `NetworkPolicy`** plus explicit
  allows (ingress to backend from the ALB/frontend, DNS egress, egress to
  RDS/Redis ports); an **IRSA `ServiceAccount`** (annotated with a placeholder
  `eks.amazonaws.com/role-arn`) so the backend gets scoped AWS creds — no static
  keys.
- **Secrets are placeholders only.** `secret.example.yaml` (excluded from the
  kustomization) holds `stringData` with `CHANGE_ME`/`<from-secrets-manager>` and
  a note to use the External Secrets Operator or Secrets Store CSI in real
  clusters. **No real secrets, endpoints, or account IDs in the repo.**
- **Backend HPA** (CPU-target), requires metrics-server (noted prereq).

## Architecture & components

```
k8s/
  kustomization.yaml       namespace=shopflow, commonLabels, resources[], images[]
  namespace.yaml           Namespace shopflow
  serviceaccount.yaml      ServiceAccount backend-sa (IRSA role-arn annotation, placeholder)
  configmap.yaml           non-secret env: ENVIRONMENT, CORS_ORIGINS, LOG_LEVEL,
                           NEXT_PUBLIC_API_URL, COOKIE_SECURE=true
  secret.example.yaml      (NOT in kustomization) placeholder Secret: DATABASE_URL,
                           REDIS_URL, JWT_SECRET_KEY, ANTHROPIC_API_KEY
  backend.yaml             Deployment (3 replicas, SA, probes /health, securityContext,
                           envFrom configmap+secret, resources) + Service (ClusterIP :8000)
                           + HorizontalPodAutoscaler (CPU 70%, 3–10)
  frontend.yaml            Deployment (2 replicas, probes /api/health, securityContext,
                           resources) + Service (ClusterIP :3000)
  ingress.yaml             Ingress (alb) — /api → backend:8000, / → frontend:3000
  networkpolicy.yaml       default-deny-ingress + allow-backend-from-namespace +
                           allow-dns-egress + allow-datastore-egress (5432/6379)
```

**Image references:** placeholder ECR repo
`<account-id>.dkr.ecr.<region>.amazonaws.com/shopflow-backend` (and `-frontend`),
`:latest` tag, overridable via the kustomization `images:` block. Image strings
are not schema-validated, so this is fine for offline verification.

## Security & policy notes (ISMS-aware — draft, pending control-owner review)

- No static AWS credentials in pods — IRSA `ServiceAccount` (ties to the E18 OIDC
  provider). Placeholder role ARN; the real role/policy is provisioned in
  Terraform (a later entry) or by the platform team.
- Default-deny NetworkPolicy with least-privilege allows (A.8.20/A.8.22 network
  segregation). Egress limited to DNS + datastore ports.
- Hardened containers: non-root, no privilege escalation, all caps dropped,
  RuntimeDefault seccomp, resource limits (prevents noisy-neighbor / DoS).
- `COOKIE_SECURE=true` in the ConfigMap (matches the app's production auth
  requirement from CLAUDE.md).
- Secrets are placeholders; real values come from AWS Secrets Manager via
  External Secrets / CSI — **drafted, not deployed**.

## Testing / verification (offline, no cluster)

Via the already-verified toolchain:
1. `kubectl kustomize k8s/` — the kustomize base builds (offline; validates
   structure, namespace/label injection, resource list).
2. `kubectl kustomize k8s/ | docker run --rm -i ghcr.io/yannh/kubeconform:latest -strict -summary`
   — schema-validates every rendered resource against the Kubernetes OpenAPI
   schemas (network egress to fetch schemas, no cluster). Must report `Invalid: 0,
   Errors: 0`.
3. `secret.example.yaml` validated with a separate kubeconform pass (it's excluded
   from the kustomization).
4. Optional fully-offline fallback: `kubectl apply --dry-run=client -k k8s/`.

No live `apply` to a cluster (there is none); ALB annotations and the IRSA role
only take effect with the LB Controller + a real cluster.

## Scope

**In:** kustomize base with namespace, backend + frontend Deployments/Services,
backend HPA, IRSA ServiceAccount, ConfigMap, placeholder Secret example, ALB
Ingress, default-deny NetworkPolicy; offline kustomize+kubeconform verification.

**Out (later / future / prereqs):**
- Installing the AWS Load Balancer Controller, metrics-server, External Secrets
  Operator (cluster add-ons — Helm; a possible later entry).
- The IRSA IAM role/policy in Terraform (placeholder ARN for now).
- Kustomize environment overlays (dev/staging/prod).
- RDS/ElastiCache provisioning (`database` module).
- Building/pushing the container images to ECR.
- Any live `kubectl apply` to a cluster.

## Follow-up after implementation

- Fill `PROMPT_LOG.md` Entry 21.
- Update memory (`shopflow_project.md` — Domain 4 E21 done; `shopflow_conventions.md`
  — k8s validated offline via kustomize+kubeconform in Docker).
- Verify with the exact kustomize/kubeconform commands before committing.
