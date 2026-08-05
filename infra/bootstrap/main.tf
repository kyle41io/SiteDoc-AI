locals {
  account_id   = data.aws_caller_identity.current.account_id
  state_bucket = "sitedoc-tfstate-${local.account_id}"
}

# --- Terraform state -------------------------------------------------------
# Bucket names are globally unique, hence the account-id suffix. Versioning is
# what makes a corrupted or half-written state recoverable.
resource "aws_s3_bucket" "state" {
  bucket = local.state_bucket
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# --- GitHub OIDC -----------------------------------------------------------
# The thumbprints below are GitHub's well-known intermediate CA fingerprints.
# AWS no longer validates them for this issuer, but the API still requires at
# least one, so both published values are listed rather than fetched at plan
# time (which would make every plan depend on a live TLS handshake).
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd",
  ]
}

# --- ECR -------------------------------------------------------------------
# In bootstrap, not the main stack: the pipeline pushes the image *before*
# `terraform apply`, because the container functions reference the tag.
resource "aws_ecr_repository" "browser" {
  name                 = "sitedoc-browser"
  image_tag_mutability = "IMMUTABLE" # tags are git SHAs; never overwrite one

  image_scanning_configuration {
    scan_on_push = true
  }
}

# ECR private storage is the one line item this architecture pays for after the
# first year. Keeping three images holds it near $0.10-0.30/month instead of
# growing with every deploy.
resource "aws_ecr_lifecycle_policy" "browser" {
  repository = aws_ecr_repository.browser.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep only the last 3 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 3
      }
      action = { type = "expire" }
    }]
  })
}
