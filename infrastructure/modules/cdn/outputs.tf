output "distribution_id" {
  description = "CloudFront distribution id."
  value       = aws_cloudfront_distribution.this.id
}

output "distribution_arn" {
  description = "CloudFront distribution ARN."
  value       = aws_cloudfront_distribution.this.arn
}

output "distribution_domain_name" {
  description = "CloudFront distribution domain name (e.g. d111111abcdef8.cloudfront.net)."
  value       = aws_cloudfront_distribution.this.domain_name
}

output "distribution_hosted_zone_id" {
  description = "CloudFront hosted zone id (for Route 53 alias records)."
  value       = aws_cloudfront_distribution.this.hosted_zone_id
}

output "origin_bucket_name" {
  description = "Static-assets S3 origin bucket name."
  value       = aws_s3_bucket.origin.id
}

output "origin_bucket_arn" {
  description = "Static-assets S3 origin bucket ARN."
  value       = aws_s3_bucket.origin.arn
}

output "oac_id" {
  description = "Origin Access Control id."
  value       = aws_cloudfront_origin_access_control.this.id
}
