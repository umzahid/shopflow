output "log_group_name" {
  description = "Central application CloudWatch log group."
  value       = aws_cloudwatch_log_group.app.name
}

output "alerts_topic_arn" {
  description = "SNS topic for billing/ops alerts."
  value       = aws_sns_topic.alerts.arn
}
