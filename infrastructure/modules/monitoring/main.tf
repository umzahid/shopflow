# Central log group + an alerts SNS topic + a billing guardrail.
# NOTE: the AWS billing metric (EstimatedCharges) is published only in
# us-east-1 and is a monthly cumulative value, so this alarm approximates the
# PRD's "> $50/day" intent as a monthly-charge ceiling. For true per-day
# alerting, use AWS Budgets (aws_budgets_budget) instead.

resource "aws_cloudwatch_log_group" "app" {
  name              = "/shopflow/${var.name}"
  retention_in_days = var.log_retention_days
}

resource "aws_sns_topic" "alerts" {
  name = "${var.name}-alerts"
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.alarm_email == "" ? 0 : 1
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

resource "aws_cloudwatch_metric_alarm" "billing" {
  alarm_name          = "${var.name}-estimated-charges"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "EstimatedCharges"
  namespace           = "AWS/Billing"
  period              = 21600 # 6h
  statistic           = "Maximum"
  threshold           = var.billing_threshold_usd
  alarm_description   = "Estimated AWS charges exceeded $${var.billing_threshold_usd}"
  dimensions          = { Currency = "USD" }
  alarm_actions       = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "notBreaching"
}
