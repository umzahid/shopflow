# Remote state: S3 bucket + DynamoDB write locking (PRD §4.2). Bootstrap once
# per account — create the bucket (versioned, encrypted) and the lock table,
# then substitute the real 12-digit account id in the bucket name below (or
# override at init time: `terraform init -backend-config="bucket=..."`).
#
# Because this backend is active, a bare `terraform init` targets S3 and needs
# the bootstrapped bucket. The two credential-free LOCAL workflows both bypass it:
#   - validate-only:   terraform init -backend=false && terraform validate
#   - LocalStack apply: localstack/run.sh copies zz_localstack_override.tf,
#     whose `backend "local" {}` replaces this backend for the run
#     (override-file semantics replace the backend block wholesale).
# The bucket name is a valid-format placeholder (not a live bucket) so `init`
# fails on "bucket does not exist", not on an invalid name.
terraform {
  backend "s3" {
    bucket         = "shopflow-tfstate-000000000000" # replace 0s with the account id
    key            = "infrastructure/dev/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "shopflow-tflock"
    encrypt        = true
  }
}
