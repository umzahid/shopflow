# Kubernetes Manifests for EKS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** A kustomize base under `k8s/` deploying the ShopFlow app tier (backend + frontend) onto EKS with an ALB Ingress, HPA, IRSA ServiceAccount, hardened securityContext, and a default-deny NetworkPolicy — all schema-valid, verified offline with `kubectl kustomize` + `kubeconform` in Docker (no cluster).

**Tech Stack:** Kubernetes manifests + Kustomize (`kubectl` v1.36 has kustomize v5 built in). Schema validation via `ghcr.io/yannh/kubeconform:latest` Docker image (already pulled + verified).

## Global Constraints

- No live `kubectl apply` to a cluster (there is none). Offline only.
- No secrets/endpoints/account IDs in the repo — `secret.example.yaml` holds placeholders (`CHANGE_ME` / `<...>`) and is EXCLUDED from the kustomization. Image repos use `<account-id>.dkr.ecr.<region>...` placeholders (overridable via the kustomization `images:` block).
- Ports/health from the real app: backend `:8000` `/health`; frontend `:3000` `/api/health`.
- kubeconform `-strict` (no unknown fields) must report `Invalid: 0, Errors: 0`.
- Modern kustomize v5 syntax: use `labels:` (with `includeSelectors: false`), NOT the deprecated `commonLabels`.

### Verification commands

Build + schema-validate the whole base:
```
kubectl kustomize /Users/emumba/projects/shopflow/k8s
kubectl kustomize /Users/emumba/projects/shopflow/k8s | docker run --rm -i ghcr.io/yannh/kubeconform:latest -strict -summary
```
Validate the excluded example Secret on its own:
```
docker run --rm -i ghcr.io/yannh/kubeconform:latest -strict -summary < /Users/emumba/projects/shopflow/k8s/secret.example.yaml
```
`kubectl kustomize` must print rendered YAML; kubeconform must report `Invalid: 0, Errors: 0`.

---

### Task 1: workloads + config (backend, frontend, SA, ConfigMap, kustomization)

**Files (all new in `k8s/`):** `namespace.yaml`, `serviceaccount.yaml`, `configmap.yaml`, `backend.yaml`, `frontend.yaml`, `kustomization.yaml`.

- [ ] **Step 1: `namespace.yaml`**

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: shopflow
```

- [ ] **Step 2: `serviceaccount.yaml`**

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: backend-sa
  namespace: shopflow
  annotations:
    # IRSA — replace with the backend IAM role ARN provisioned in Terraform.
    eks.amazonaws.com/role-arn: "arn:aws:iam::<account-id>:role/shopflow-dev-backend-irsa"
```

- [ ] **Step 3: `configmap.yaml`**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: shopflow-config
  namespace: shopflow
data:
  ENVIRONMENT: "production"
  LOG_LEVEL: "info"
  COOKIE_SECURE: "true"
  CORS_ORIGINS: '["https://shopflow.example.com"]'
  NEXT_PUBLIC_API_URL: "https://shopflow.example.com/api/v1"
```

- [ ] **Step 4: `backend.yaml` (Deployment + Service + HPA)**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: shopflow
  labels:
    app.kubernetes.io/name: backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app.kubernetes.io/name: backend
  template:
    metadata:
      labels:
        app.kubernetes.io/name: backend
    spec:
      serviceAccountName: backend-sa
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 1000
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: backend
          image: shopflow-backend:latest
          ports:
            - name: http
              containerPort: 8000
          envFrom:
            - configMapRef:
                name: shopflow-config
            - secretRef:
                name: shopflow-secrets
          readinessProbe:
            httpGet:
              path: /health
              port: http
            initialDelaySeconds: 10
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /health
              port: http
            initialDelaySeconds: 20
            periodSeconds: 15
          resources:
            requests:
              cpu: 250m
              memory: 512Mi
            limits:
              cpu: "1"
              memory: 1Gi
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop:
                - ALL
          volumeMounts:
            - name: tmp
              mountPath: /tmp
      volumes:
        - name: tmp
          emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: backend
  namespace: shopflow
  labels:
    app.kubernetes.io/name: backend
spec:
  type: ClusterIP
  selector:
    app.kubernetes.io/name: backend
  ports:
    - name: http
      port: 8000
      targetPort: http
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: backend
  namespace: shopflow
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: backend
  minReplicas: 3
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

- [ ] **Step 5: `frontend.yaml` (Deployment + Service)**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: shopflow
  labels:
    app.kubernetes.io/name: frontend
spec:
  replicas: 2
  selector:
    matchLabels:
      app.kubernetes.io/name: frontend
  template:
    metadata:
      labels:
        app.kubernetes.io/name: frontend
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: frontend
          image: shopflow-frontend:latest
          ports:
            - name: http
              containerPort: 3000
          envFrom:
            - configMapRef:
                name: shopflow-config
          readinessProbe:
            httpGet:
              path: /api/health
              port: http
            initialDelaySeconds: 10
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /api/health
              port: http
            initialDelaySeconds: 20
            periodSeconds: 15
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop:
                - ALL
---
apiVersion: v1
kind: Service
metadata:
  name: frontend
  namespace: shopflow
  labels:
    app.kubernetes.io/name: frontend
spec:
  type: ClusterIP
  selector:
    app.kubernetes.io/name: frontend
  ports:
    - name: http
      port: 3000
      targetPort: http
```

- [ ] **Step 6: `kustomization.yaml`** (workloads only for now; ingress + networkpolicy added in Task 2)

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: shopflow

labels:
  - includeSelectors: false
    pairs:
      app.kubernetes.io/part-of: shopflow
      app.kubernetes.io/managed-by: kustomize

resources:
  - namespace.yaml
  - serviceaccount.yaml
  - configmap.yaml
  - backend.yaml
  - frontend.yaml

images:
  - name: shopflow-backend
    newName: <account-id>.dkr.ecr.<region>.amazonaws.com/shopflow-backend
    newTag: latest
  - name: shopflow-frontend
    newName: <account-id>.dkr.ecr.<region>.amazonaws.com/shopflow-frontend
    newTag: latest
```

- [ ] **Step 7: Verify** — run the build + kubeconform commands. `kubectl kustomize k8s/` renders; kubeconform reports `Invalid: 0, Errors: 0`. (Note the built output references a `shopflow-secrets` Secret via `secretRef` that the kustomization does not create — that's intentional; kubeconform validates resources independently, so this does not fail.)

- [ ] **Step 8: Commit**

```bash
cd ~/projects/shopflow
git add k8s/namespace.yaml k8s/serviceaccount.yaml k8s/configmap.yaml k8s/backend.yaml k8s/frontend.yaml k8s/kustomization.yaml
git commit -m "feat(k8s): backend + frontend workloads, IRSA SA, config (kustomize base)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: exposure + security (Ingress, NetworkPolicy, Secret example)

**Files:** new `k8s/ingress.yaml`, `k8s/networkpolicy.yaml`, `k8s/secret.example.yaml`; modify `k8s/kustomization.yaml`.

- [ ] **Step 1: `ingress.yaml`**

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: shopflow
  namespace: shopflow
  annotations:
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP":80},{"HTTPS":443}]'
    alb.ingress.kubernetes.io/ssl-redirect: "443"
    # Backend target-group health check; frontend uses its readiness probe.
    alb.ingress.kubernetes.io/healthcheck-path: /health
spec:
  ingressClassName: alb
  rules:
    - http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: backend
                port:
                  number: 8000
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend
                port:
                  number: 3000
```

- [ ] **Step 2: `networkpolicy.yaml`** (default-deny ingress + explicit allows + restricted egress)

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: shopflow
spec:
  podSelector: {}
  policyTypes:
    - Ingress
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-backend-ingress
  namespace: shopflow
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: backend
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app.kubernetes.io/name: frontend
        - namespaceSelector: {}
      ports:
        - protocol: TCP
          port: 8000
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend-ingress
  namespace: shopflow
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: frontend
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector: {}
      ports:
        - protocol: TCP
          port: 3000
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-egress
  namespace: shopflow
spec:
  podSelector: {}
  policyTypes:
    - Egress
  egress:
    # DNS
    - ports:
        - protocol: UDP
          port: 53
        - protocol: TCP
          port: 53
    # Managed datastores (RDS/ElastiCache) + HTTPS (AWS APIs, Anthropic)
    - ports:
        - protocol: TCP
          port: 5432
        - protocol: TCP
          port: 6379
        - protocol: TCP
          port: 443
```

- [ ] **Step 3: `secret.example.yaml`** (placeholders; excluded from kustomization)

```yaml
# EXAMPLE ONLY — never commit real values, do not apply as-is.
# In a real cluster, source these from AWS Secrets Manager via the External
# Secrets Operator or the Secrets Store CSI driver instead of a static Secret.
apiVersion: v1
kind: Secret
metadata:
  name: shopflow-secrets
  namespace: shopflow
type: Opaque
stringData:
  DATABASE_URL: "postgresql+asyncpg://USER:CHANGE_ME@<rds-endpoint>:5432/shopflow"
  REDIS_URL: "redis://:CHANGE_ME@<elasticache-endpoint>:6379/0"
  JWT_SECRET_KEY: "CHANGE_ME"
  ANTHROPIC_API_KEY: "CHANGE_ME"
```

- [ ] **Step 4: Add Ingress + NetworkPolicy to `kustomization.yaml`**

Change the `resources:` list to:

```yaml
resources:
  - namespace.yaml
  - serviceaccount.yaml
  - configmap.yaml
  - backend.yaml
  - frontend.yaml
  - ingress.yaml
  - networkpolicy.yaml
```

(Leave `secret.example.yaml` OUT — it is an example, not a managed resource.)

- [ ] **Step 5: Verify** — run all three verification commands (build + kubeconform on the base, and kubeconform on `secret.example.yaml`). Base: `Invalid: 0`. Secret example: `Valid: 1`.

- [ ] **Step 6: Commit**

```bash
cd ~/projects/shopflow
git add k8s/ingress.yaml k8s/networkpolicy.yaml k8s/secret.example.yaml k8s/kustomization.yaml
git commit -m "feat(k8s): ALB ingress, default-deny NetworkPolicy, secret example

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: PROMPT_LOG Entry 21, memory (orchestrator handles this)

- [ ] **Step 1: Final verify** — re-run build + kubeconform as a regression guard.
- [ ] **Step 2: Fill PROMPT_LOG Entry 21** — Tool Used (Claude Code, Opus 4.8; superpowers pipeline), verbatim prompt (`_[Umair: confirm exact wording]_`), Output Quality (`_(Umair to rate)_`), What You Changed (kustomize base: workloads, SA/IRSA, ConfigMap, secret example, ALB ingress, default-deny NetworkPolicy; spec/plan), What You Learned (offline kustomize+kubeconform validation; NetworkPolicy default-deny model; IRSA SA vs static keys; datastores out-of-cluster; prereqs = LB Controller / metrics-server / External Secrets).
- [ ] **Step 3: Update memory** — `shopflow_project.md`: Domain 4 E21 done (3 of 5); remaining E19 Well-Architected, E22 infracost. `shopflow_conventions.md`: k8s validated offline via `kubectl kustomize | kubeconform` in Docker. Update `MEMORY.md`.
- [ ] **Step 4: Commit** `PROMPT_LOG.md` (`docs(k8s): fill PROMPT_LOG Entry 21`).

---

## Self-Review

**1. Spec coverage:** backend + frontend Deployments/Services (Task 1); backend HPA (Task 1 Step 4); IRSA ServiceAccount (Task 1 Step 2); ConfigMap + placeholder Secret example (Tasks 1 & 2); ALB Ingress path-based (Task 2 Step 1); default-deny NetworkPolicy + allows + restricted egress (Task 2 Step 2); kustomize base with namespace/labels/images (Task 1 Step 6, extended Task 2 Step 4). ✓

**2. Placeholder scan:** every step carries full literal YAML. ✓

**3. Correctness guards:**
- `kubeconform -strict` clean depends on: valid apiVersions (`apps/v1`, `autoscaling/v2`, `networking.k8s.io/v1`, `v1`), no unknown fields. Reviewed each. ✓
- `readOnlyRootFilesystem: true` on backend paired with a `tmp` emptyDir mount so the app can still write `/tmp`. Frontend omits read-only (Next.js writes cache) but keeps non-root + drop-ALL. ✓
- `targetPort: http` matches the named container port on both services. ✓
- Probes hit the real health paths (`/health`, `/api/health`) by port name. ✓
- Modern kustomize `labels:` with `includeSelectors: false` (avoids mutating immutable selectors; the explicit `app.kubernetes.io/name` selector labels live in the manifests). ✓
- `secret.example.yaml` deliberately excluded from `resources:`; validated separately; the `secretRef` dangling reference is expected and does not fail kubeconform. ✓
- NetworkPolicy: `allow-egress` with `podSelector: {}` + `policyTypes: [Egress]` turns on egress restriction for all pods (only listed ports allowed) — effectively default-deny-egress-except; DNS + 5432/6379/443 permitted. ✓

**4. Risks / notes:**
- kubeconform fetches schemas over the network (like `terraform init`); no cluster/creds needed. If schema egress is blocked, fall back to `kubectl apply --dry-run=client -k k8s/`.
- ALB annotations / IRSA role ARN only take effect with the AWS Load Balancer Controller + a real cluster + the Terraform IAM role — documented prerequisites, not validated here.
- `runAsNonRoot` requires the container images to actually run as uid 1000; a real deploy needs the Dockerfiles to support that (backend image already installs deps as non-root per repo conventions; frontend Next standalone runs as `node`).
- Single global ALB `healthcheck-path: /health` suits the backend target group; per-target health tuning is a documented follow-up.
