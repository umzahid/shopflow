# Production — HA + hardened (terraform apply -var-file=environments/production.tfvars).
environment = "production"
owner       = "platform-team"
cost_center = "engineering-prod"

az_count           = 3
single_nat_gateway = false # one NAT per AZ — no SPOF

node_instance_types = ["t3.large"]
db_instance_class   = "db.t3.medium"
db_multi_az         = true
redis_node_type     = "cache.t3.small"

# Reach the EKS API privately in prod; set your VPN/bastion CIDRs.
endpoint_public_access = false
public_access_cidrs    = []
billing_threshold_usd  = 200
