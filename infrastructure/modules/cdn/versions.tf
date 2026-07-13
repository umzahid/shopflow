# Provider source only — the root module (../../versions.tf) owns the version
# pins and required_version, so a bump is a one-file change.
terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}
