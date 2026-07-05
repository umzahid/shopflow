output "bucket_id" {
  description = "Product-images bucket name."
  value       = aws_s3_bucket.images.id
}

output "bucket_arn" {
  description = "Product-images bucket ARN."
  value       = aws_s3_bucket.images.arn
}
