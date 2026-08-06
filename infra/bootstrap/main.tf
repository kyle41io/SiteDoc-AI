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
# Read, not created. AWS permits exactly one OIDC provider per issuer URL per
# account, so this is shared account-level infrastructure rather than something
# SiteDoc owns: `kyle41io/Interview-Prepare` already assumes a role through this
# same provider. Managing it here would mean a `terraform destroy` of this stack
# silently breaking that repo's deploys, and any thumbprint drift between the two
# configurations fighting on every apply.
#
# It must therefore exist before the first apply. In a fresh account, create it
# once by hand:
#
#   aws iam create-open-id-connect-provider \
#     --url https://token.actions.githubusercontent.com \
#     --client-id-list sts.amazonaws.com \
#     --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
#
# `client_id_list` must contain `sts.amazonaws.com` or the `:aud` condition in
# the trust policy can never match. The thumbprint is a formality — AWS stopped
# validating it for this issuer in 2023 but the API still demands one.
data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
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

# Lambda pulls the image as the `lambda.amazonaws.com` service principal, not as
# whatever identity ran the apply, so without this every `CreateFunction` for a
# container function fails with "Lambda does not have permission to access the
# ECR image". Creating such a function in the console appears not to need it only
# because the console adds this policy for you behind the scenes; Terraform does
# not, which makes it a one-line omission that costs a whole failed deploy.
#
# `aws:SourceArn` scopes the grant to this account's own sitedoc functions —
# without it, the service principal is a confused-deputy hole any account's
# Lambda could pull through.
data "aws_iam_policy_document" "browser_lambda_pull" {
  statement {
    sid    = "LambdaECRImageRetrievalPolicy"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }

    actions = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"]

    condition {
      test     = "StringLike"
      variable = "aws:SourceArn"
      values   = ["arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:sitedoc-*"]
    }
  }
}

resource "aws_ecr_repository_policy" "browser" {
  repository = aws_ecr_repository.browser.name
  policy     = data.aws_iam_policy_document.browser_lambda_pull.json
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
