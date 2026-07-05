# ShopFlow — AI-Powered E-Commerce Platform

> Emumba GenAI Upskilling Assignment | 8-Week Project | 480 Points

---

## Architecture

```mermaid
flowchart TB
  subgraph Client
    U["Customer / Merchant browser"]
  end

  subgraph Edge
    CF["CloudFront (CDN)"]
    ALB["Application Load Balancer"]
  end

  subgraph Cluster["EKS (Terraform-provisioned)"]
    FE["Frontend — Next.js 14<br/>storefront + merchant admin"]
    BE["Backend — FastAPI (async)"]
  end

  subgraph Data
    PG[("PostgreSQL 15<br/>+ pgvector (RDS)")]
    RD[("Redis 7<br/>(ElastiCache)")]
    S3[("S3<br/>product images")]
    SM["Secrets Manager"]
  end

  subgraph ML["ML / AI"]
    SEARCH["Hybrid search<br/>MiniLM + pgvector"]
    FORECAST["Demand forecast<br/>Prophet"]
    FRAUD["Fraud scoring<br/>LightGBM + TreeSHAP"]
    LLM["Claude API<br/>Copilot + descriptions + summary"]
  end

  subgraph Obs["Observability"]
    PROM["Prometheus /metrics"]
    GRAF["Grafana dashboards"]
    CW["CloudWatch logs + alarms"]
  end

  U --> CF --> ALB
  CF -->|static assets| S3
  ALB --> FE
  ALB --> BE
  FE -->|"/api/v1"| BE
  BE --> PG
  BE --> RD
  BE --> S3
  BE --> SM
  BE --> SEARCH & FORECAST & FRAUD & LLM
  SEARCH --> PG
  BE --> PROM --> GRAF
  BE --> CW

  subgraph CICD["CI/CD — GitHub Actions (12 stages)"]
    GH["push / PR"] --> LINT["lint · test · scan"] --> BUILD["build & push (GHCR, SHA)"] --> DEPLOY["staging → prod (approval)"]
  end
  DEPLOY -.-> Cluster
```

> Cloud infra (EKS, RDS, ElastiCache, S3, CloudFront, Secrets Manager,
> CloudWatch) is defined in Terraform under `infrastructure/` and validated
> offline — **not applied**, per the free-tier constraint (see
> `docs/aws-free-tier.md`). Locally the whole stack runs via `docker compose`.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Backend | Python 3.11 + FastAPI |
| Database | PostgreSQL 15 + pgvector |
| Cache | Redis 7 |
| Frontend | Next.js 14 + TypeScript + Tailwind |
| ML | Prophet + LightGBM + Claude API |
| CI/CD | GitHub Actions |
| Cloud | AWS (Terraform) |
| Monitoring | Prometheus + Grafana |

## Quick Start

```bash
git clone <repo-url> && cd shopflow
cp env.example .env   # Fill in your values
docker compose up
```

App: http://localhost:3000 | API docs: http://localhost:8000/docs | Grafana: http://localhost:3001

## Running Tests

```bash
cd backend
pip install -r requirements.txt
pytest tests/ --cov=app --cov-report=term-missing
```

## Features

- Semantic product search (pgvector + sentence-transformers)
- Demand forecasting with restock alerts (Prophet)
- Fraud detection at checkout (LightGBM + SHAP)
- Merchant Copilot — natural language business analytics (Claude API)
- AI product description generator

## Prompt Log

See [PROMPT_LOG.md](PROMPT_LOG.md) — documents every AI prompt used across all 6 domains.

## Known Issues / Work in Progress

*(Update this section as you go)*

## Cost Estimate

*(Add infracost output here in Week 5)*
