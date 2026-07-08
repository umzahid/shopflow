#!/usr/bin/env bash
# LocalStack terraform apply — the $0 path for the PRD's "apply runs cleanly"
# deliverable. Applies the LocalStack-community-supported modules (networking,
# storage, monitoring); EKS/RDS/ElastiCache/CloudFront are Pro-only and stay
# validate-only (see docs/localstack-apply.md).
#
# Prereqs: docker. Run from the repo root or this directory.
set -euo pipefail

INFRA_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OVERRIDE_SRC="$INFRA_DIR/localstack/localstack_override.tf"
OVERRIDE_DST="$INFRA_DIR/zz_localstack_override.tf"

# Terraform runs inside LocalStack's network namespace so localhost:4566 is
# LocalStack itself — immune to macOS/docker host-networking loopback quirks
# (an AWS-SDK dial of [::1]:4566 under --network host gets connection-refused).
TF="docker run --rm --network container:shopflow-localstack \
  -v $INFRA_DIR:/infra -w /infra \
  -e AWS_ENDPOINT_URL=http://127.0.0.1:4566 \
  -e AWS_ACCESS_KEY_ID=test -e AWS_SECRET_ACCESS_KEY=test \
  -e AWS_DEFAULT_REGION=us-east-1 \
  hashicorp/terraform:1.9"

echo ">> starting LocalStack (community)"
docker rm -f shopflow-localstack >/dev/null 2>&1 || true
# Pinned: newer 'latest' images exit 55 demanding a license token; 3.8 is the
# last verified token-free community release with everything we need (EC2-mock,
# S3, CloudWatch, IAM, STS).
docker run -d --name shopflow-localstack -p 4566:4566 localstack/localstack:3.8 >/dev/null
for i in $(seq 1 30); do
  curl -s http://localhost:4566/_localstack/health >/dev/null && break
  sleep 2
done

cleanup() { rm -f "$OVERRIDE_DST"; }
trap cleanup EXIT
cp "$OVERRIDE_SRC" "$OVERRIDE_DST"

echo ">> terraform init"
$TF init -input=false

echo ">> terraform apply (community-supported modules)"
$TF apply -input=false -auto-approve \
  -var-file=environments/localstack.tfvars \
  -target=module.networking -target=module.storage -target=module.monitoring

echo ">> applied resources:"
$TF state list

echo ">> done. Destroy with: docker rm -f shopflow-localstack (state is throwaway)"
