# LocalStack provider override — NOT active in normal runs.
#
# Usage (see localstack/run.sh): copy this file to the infrastructure root as
# `zz_localstack_override.tf` (gitignored) for the duration of a LocalStack
# apply, then delete it. Terraform's override-file semantics merge these
# arguments into the existing provider "aws" block; `default_tags` from
# main.tf is preserved.
#
# Service endpoints come from AWS_ENDPOINT_URL=http://localhost:4566
# (supported natively by hashicorp/aws >= 5.22, so no endpoints block needed).

provider "aws" {
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
  s3_use_path_style           = true
}

# Override files replace the backend block wholesale: the LocalStack run uses
# throwaway local state instead of the real S3 remote backend (backend.tf).
terraform {
  backend "local" {}
}
