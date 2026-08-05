data "aws_caller_identity" "current" {}

# The AWS-managed key SSM uses for SecureString parameters. The scan role gets an
# explicit kms:Decrypt on it rather than relying on the managed key's default
# account-wide policy.
data "aws_kms_alias" "ssm" {
  name = "alias/aws/ssm"
}

data "aws_ecr_repository" "browser" {
  name = "sitedoc-browser" # created in infra/bootstrap
}

locals {
  account_id  = data.aws_caller_identity.current.account_id
  name_prefix = "sitedoc"

  # Bucket names are globally unique, hence the account-id suffix.
  frontend_bucket  = "sitedoc-frontend-${local.account_id}"
  artifacts_bucket = "sitedoc-artifacts-${local.account_id}"

  table_name = "sitedoc_audits"
  ssm_prefix = "/sitedoc-ai"

  image_uri = "${data.aws_ecr_repository.browser.repository_url}:${var.image_tag}"
}
