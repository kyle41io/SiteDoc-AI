# Pre-created on purpose. Letting Lambda create its own log group on first
# invocation yields an unmanaged group with never-expiring retention — a slow,
# silent bill that Terraform does not know exists.
resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${local.name_prefix}-api"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "scan" {
  name              = "/aws/lambda/${local.name_prefix}-scan"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "pdf" {
  name              = "/aws/lambda/${local.name_prefix}-pdf"
  retention_in_days = var.log_retention_days
}
