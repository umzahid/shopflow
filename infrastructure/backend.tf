# Remote state: S3 bucket + DynamoDB write locking (PRD §4.2). Bootstrap once
# per account — create the bucket (versioned, encrypted) and the lock table,
# then substitute the real bucket name below.
#
# Local workflows need no AWS access despite this block:
#   - validate-only:   terraform init -backend=false && terraform validate
#   - LocalStack apply: localstack/run.sh copies zz_localstack_override.tf,
#     whose `backend "local" {}` replaces this backend for the run
#     (override-file semantics replace the backend block wholesale).
terraform {
  backend "s3" {
    bucket         = "shopflow-tfstate-<account-id>" # placeholder until bootstrap
    key            = "infrastructure/dev/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "shopflow-tflock"
    encrypt        = true
  }
}
