# Staging — smaller/cheaper than prod, same code (terraform apply -var-file=environments/staging.tfvars).
environment = "staging"
owner       = "platform-team"
cost_center = "engineering-staging"

az_count           = 2
single_nat_gateway = true

node_instance_types = ["t3.small"]
# Staging tolerates node interruption — spot cuts worker cost ~70%.
node_capacity_type = "SPOT"
db_instance_class  = "db.t3.small"
db_multi_az        = false
redis_node_type    = "cache.t3.micro"

endpoint_public_access = true
billing_threshold_usd  = 50
