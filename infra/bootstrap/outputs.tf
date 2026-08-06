output "deploy_role_arn" {
  description = "Set as the AWS_ROLE_ARN variable on the GitHub aws-production environment."
  value       = aws_iam_role.deploy.arn
}

output "state_bucket" {
  description = "Bucket name for infra/backend.tf."
  value       = aws_s3_bucket.state.id
}

output "ecr_repository_url" {
  description = "Push target for the browser image."
  value       = aws_ecr_repository.browser.repository_url
}
