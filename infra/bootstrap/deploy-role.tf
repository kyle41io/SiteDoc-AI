# Trust policy. Two details that cost real debugging time if wrong:
#  - `sub` is pinned to the *environment* form. GitHub swaps the claim to
#    `repo:owner/name:environment:<name>` when a job declares `environment:`, and
#    matching only that form is what stops a future workflow from assuming this
#    role straight off `main` and skipping the approval gate. The name is
#    case-sensitive here and not case-sensitive on GitHub's side — see
#    `var.deploy_environment` for why that matters.
#  - `aud` must be checked too, or any GitHub workflow anywhere could present a
#    token minted for a different audience.
data "aws_iam_policy_document" "deploy_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:environment:${var.deploy_environment}"]
    }
  }
}

resource "aws_iam_role" "deploy" {
  name               = "sitedoc-deploy"
  description        = "GitHub Actions deploy role for SiteDoc AI"
  assume_role_policy = data.aws_iam_policy_document.deploy_trust.json
}

# Read actions are broadened per service so a plan never fails on a missing
# Describe/Get; mutating actions stay enumerated. `ssm:DescribeParameters` and
# `logs:DescribeLogGroups` cannot be resource-scoped and return metadata only.
# CloudFront has no resource-level IAM at all, hence `*` with a curated action
# list.
data "aws_iam_policy_document" "deploy" {
  statement {
    sid    = "TerraformState"
    effect = "Allow"
    actions = [
      "s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket",
      "s3:GetBucketVersioning", "s3:GetBucketLocation",
    ]
    resources = [
      aws_s3_bucket.state.arn,
      "${aws_s3_bucket.state.arn}/*",
    ]
  }

  statement {
    sid    = "SiteBuckets"
    effect = "Allow"
    actions = [
      "s3:Get*", "s3:List*",
      "s3:CreateBucket", "s3:PutBucketPolicy", "s3:PutBucketVersioning",
      "s3:PutBucketPublicAccessBlock", "s3:PutBucketOwnershipControls",
      "s3:PutBucketTagging", "s3:PutEncryptionConfiguration",
      "s3:PutLifecycleConfiguration", "s3:DeleteBucketPolicy",
      "s3:PutObject", "s3:DeleteObject", "s3:PutObjectAcl",
    ]
    resources = [
      "arn:aws:s3:::sitedoc-frontend-${local.account_id}",
      "arn:aws:s3:::sitedoc-frontend-${local.account_id}/*",
      "arn:aws:s3:::sitedoc-artifacts-${local.account_id}",
      "arn:aws:s3:::sitedoc-artifacts-${local.account_id}/*",
    ]
  }

  statement {
    sid    = "Dynamo"
    effect = "Allow"
    actions = [
      "dynamodb:Describe*", "dynamodb:List*",
      "dynamodb:CreateTable", "dynamodb:UpdateTable", "dynamodb:DeleteTable",
      "dynamodb:UpdateTimeToLive", "dynamodb:TagResource", "dynamodb:UntagResource",
    ]
    resources = ["arn:aws:dynamodb:${var.region}:${local.account_id}:table/sitedoc_audits"]
  }

  statement {
    sid    = "Queues"
    effect = "Allow"
    actions = [
      "sqs:Get*", "sqs:List*",
      "sqs:CreateQueue", "sqs:SetQueueAttributes", "sqs:DeleteQueue",
      "sqs:TagQueue", "sqs:UntagQueue",
    ]
    resources = ["arn:aws:sqs:${var.region}:${local.account_id}:sitedoc-scan*"]
  }

  statement {
    sid    = "Images"
    effect = "Allow"
    actions = [
      "ecr:GetAuthorizationToken", "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:Describe*",
      "ecr:InitiateLayerUpload", "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload", "ecr:PutImage",
      # The `aws_ecr_repository` data source reads tags as well as the
      # repository, and ListTagsForResource is not covered by Describe*.
      "ecr:ListTagsForResource",
    ]
    resources = ["*"] # GetAuthorizationToken has no resource
  }

  # `data.aws_kms_alias.ssm` calls ListAliases, which takes no resource and has
  # no key-policy path — without this every plan fails with AccessDenied before
  # it reaches a single resource. Encrypting the SecureString parameters
  # themselves needs no IAM grant: the AWS-managed key's own policy authorizes it
  # for calls arriving via ssm.amazonaws.com.
  statement {
    sid       = "DiscoverManagedKey"
    effect    = "Allow"
    actions   = ["kms:ListAliases", "kms:DescribeKey"]
    resources = ["*"]
  }

  statement {
    sid    = "Functions"
    effect = "Allow"
    actions = [
      "lambda:Get*", "lambda:List*",
      "lambda:CreateFunction", "lambda:DeleteFunction", "lambda:UpdateFunctionCode",
      "lambda:UpdateFunctionConfiguration", "lambda:PublishVersion",
      "lambda:TagResource", "lambda:UntagResource",
      "lambda:AddPermission", "lambda:RemovePermission",
      "lambda:CreateFunctionUrlConfig", "lambda:UpdateFunctionUrlConfig",
      "lambda:DeleteFunctionUrlConfig",
      "lambda:CreateEventSourceMapping", "lambda:UpdateEventSourceMapping",
      "lambda:DeleteEventSourceMapping",
      "lambda:PutFunctionConcurrency", "lambda:DeleteFunctionConcurrency",
    ]
    resources = ["*"] # event source mappings are identified by UUID, not name
  }

  statement {
    sid    = "RuntimeRoles"
    effect = "Allow"
    actions = [
      "iam:Get*", "iam:List*",
      "iam:CreateRole", "iam:DeleteRole", "iam:TagRole", "iam:UntagRole",
      "iam:PutRolePolicy", "iam:DeleteRolePolicy",
      "iam:AttachRolePolicy", "iam:DetachRolePolicy",
      "iam:UpdateAssumeRolePolicy", "iam:PassRole",
    ]
    resources = ["arn:aws:iam::${local.account_id}:role/sitedoc-*"]
  }

  statement {
    sid    = "Logs"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup", "logs:DeleteLogGroup", "logs:PutRetentionPolicy",
      "logs:TagResource", "logs:UntagResource", "logs:ListTagsForResource",
      "logs:DescribeLogStreams",
    ]
    # BOTH ARN forms, deliberately: group-level calls (CreateLogGroup,
    # PutRetentionPolicy, TagResource) need the bare form, and the `:*` form only
    # matches streams. Omitting either produces an AccessDenied that looks like a
    # policy typo.
    resources = [
      "arn:aws:logs:${var.region}:${local.account_id}:log-group:/aws/lambda/sitedoc-*",
      "arn:aws:logs:${var.region}:${local.account_id}:log-group:/aws/lambda/sitedoc-*:*",
    ]
  }

  statement {
    sid       = "LogDiscovery"
    effect    = "Allow"
    actions   = ["logs:DescribeLogGroups"]
    resources = ["*"] # cannot be resource-scoped; returns metadata only
  }

  statement {
    sid    = "Parameters"
    effect = "Allow"
    actions = [
      "ssm:GetParameter", "ssm:GetParameters", "ssm:PutParameter",
      "ssm:DeleteParameter", "ssm:AddTagsToResource",
      "ssm:ListTagsForResource",
    ]
    resources = ["arn:aws:ssm:${var.region}:${local.account_id}:parameter/sitedoc-ai/*"]
  }

  statement {
    sid       = "ParameterDiscovery"
    effect    = "Allow"
    actions   = ["ssm:DescribeParameters"]
    resources = ["*"] # cannot be resource-scoped; returns metadata only
  }

  statement {
    sid    = "Edge"
    effect = "Allow"
    actions = [
      # Describe* as well as Get*: reading a CloudFront Function uses
      # cloudfront:DescribeFunction, which Get* does not match.
      "cloudfront:Get*", "cloudfront:List*", "cloudfront:Describe*",
      "cloudfront:CreateDistribution", "cloudfront:UpdateDistribution",
      "cloudfront:DeleteDistribution",
      "cloudfront:CreateOriginAccessControl", "cloudfront:UpdateOriginAccessControl",
      "cloudfront:DeleteOriginAccessControl",
      "cloudfront:CreateFunction", "cloudfront:UpdateFunction",
      "cloudfront:PublishFunction", "cloudfront:DeleteFunction",
      "cloudfront:CreateInvalidation",
      "cloudfront:TagResource", "cloudfront:UntagResource",
    ]
    resources = ["*"] # CloudFront has no resource-level IAM
  }
}

resource "aws_iam_role_policy" "deploy" {
  name   = "sitedoc-deploy"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}
