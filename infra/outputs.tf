output "base_url" {
  description = "Public entry point. Also written to SSM for the PDF renderer."
  value       = "https://${aws_cloudfront_distribution.main.domain_name}"
}

output "distribution_id" {
  description = "Needed by the deploy workflow's invalidation step."
  value       = aws_cloudfront_distribution.main.id
}

output "frontend_bucket" {
  description = "Sync target for the static export."
  value       = aws_s3_bucket.frontend.id
}

output "artifacts_bucket" {
  value = aws_s3_bucket.artifacts.id
}

output "queue_url" {
  value = aws_sqs_queue.scan.url
}

output "table_name" {
  value = aws_dynamodb_table.audits.name
}
