# LocalStack (community edition) — $0 apply of the community-supported modules:
#   networking (VPC/subnets/NAT/flow logs), storage (S3), monitoring (CloudWatch).
# EKS, RDS, ElastiCache, and CloudFront are LocalStack Pro-only; those modules
# are excluded via -target in localstack/run.sh and documented in
# docs/localstack-apply.md.
environment = "localstack"
owner       = "platform-team"
cost_center = "engineering-localstack"

az_count           = 2
single_nat_gateway = true

billing_threshold_usd = 50
