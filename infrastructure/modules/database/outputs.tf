output "rds_endpoint" {
  description = "RDS Postgres endpoint (host:port)."
  value       = aws_db_instance.this.endpoint
}

output "redis_endpoint" {
  description = "ElastiCache Redis primary endpoint address."
  value       = aws_elasticache_cluster.this.cache_nodes[0].address
}

output "db_secret_arn" {
  description = "Secrets Manager ARN holding DB credentials + connection URL."
  value       = aws_secretsmanager_secret.db.arn
}
