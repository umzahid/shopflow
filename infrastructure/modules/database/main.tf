# RDS PostgreSQL (Multi-AZ) + ElastiCache Redis, both private-subnet-only, with
# credentials generated here and stored in Secrets Manager — never in plaintext
# config or Git (PRD hardening rule).

# ── Security groups ─────────────────────────────────────────────────────────
resource "aws_security_group" "rds" {
  name_prefix = "${var.name}-rds-"
  description = "RDS Postgres — ingress from within the VPC only"
  vpc_id      = var.vpc_id

  ingress {
    description = "Postgres from VPC"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr_block]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group" "redis" {
  name_prefix = "${var.name}-redis-"
  description = "ElastiCache Redis — ingress from within the VPC only"
  vpc_id      = var.vpc_id

  ingress {
    description = "Redis from VPC"
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr_block]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  lifecycle {
    create_before_destroy = true
  }
}

# ── RDS PostgreSQL ──────────────────────────────────────────────────────────
resource "aws_db_subnet_group" "this" {
  name       = "${var.name}-db"
  subnet_ids = var.private_subnet_ids
}

resource "random_password" "db" {
  length  = 24
  special = false
}

resource "aws_db_instance" "this" {
  identifier     = "${var.name}-postgres"
  engine         = "postgres"
  engine_version = "15"
  instance_class = var.db_instance_class

  allocated_storage     = 20
  max_allocated_storage = 100
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = "shopflow"
  username = var.db_username
  password = random_password.db.result

  multi_az               = var.db_multi_az
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false

  backup_retention_period   = var.backup_retention_days
  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "${var.name}-postgres-final"

  auto_minor_version_upgrade = true
}

# ── ElastiCache Redis ───────────────────────────────────────────────────────
resource "aws_elasticache_subnet_group" "this" {
  name       = "${var.name}-redis"
  subnet_ids = var.private_subnet_ids
}

resource "aws_elasticache_cluster" "this" {
  cluster_id           = "${var.name}-redis"
  engine               = "redis"
  node_type            = var.redis_node_type
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  engine_version       = "7.1"
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.this.name
  security_group_ids   = [aws_security_group.redis.id]
}

# ── Secrets Manager: connection string + credentials ────────────────────────
resource "aws_secretsmanager_secret" "db" {
  name_prefix = "${var.name}-db-"
  description = "RDS credentials + connection URL for ${var.name}"
}

resource "aws_secretsmanager_secret_version" "db" {
  secret_id = aws_secretsmanager_secret.db.id
  secret_string = jsonencode({
    username = var.db_username
    password = random_password.db.result
    host     = aws_db_instance.this.address
    port     = 5432
    dbname   = "shopflow"
    url      = "postgresql+asyncpg://${var.db_username}:${random_password.db.result}@${aws_db_instance.this.address}:5432/shopflow"
  })
}
