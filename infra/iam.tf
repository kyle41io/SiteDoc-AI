data "aws_iam_policy_document" "lambda_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "api" {
  name               = "${local.name_prefix}-api"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

resource "aws_iam_role" "scan" {
  name               = "${local.name_prefix}-scan"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

resource "aws_iam_role" "pdf" {
  name               = "${local.name_prefix}-pdf"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

# --- api -------------------------------------------------------------------
# Writing logs is granted explicitly against the pre-created group rather than by
# attaching AWSLambdaBasicExecutionRole, which allows CreateLogGroup on `*` — the
# exact behavior the pre-created groups exist to prevent.
data "aws_iam_policy_document" "api" {
  statement {
    sid       = "Logs"
    effect    = "Allow"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.api.arn}:*"]
  }

  statement {
    sid       = "Records"
    effect    = "Allow"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem"]
    resources = [aws_dynamodb_table.audits.arn]
  }

  statement {
    sid       = "Dispatch"
    effect    = "Allow"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.scan.arn]
  }
}

resource "aws_iam_role_policy" "api" {
  name   = "${local.name_prefix}-api"
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.api.json
}

# --- scan ------------------------------------------------------------------
data "aws_iam_policy_document" "scan" {
  statement {
    sid       = "Logs"
    effect    = "Allow"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.scan.arn}:*"]
  }

  statement {
    sid       = "Records"
    effect    = "Allow"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem"]
    resources = [aws_dynamodb_table.audits.arn]
  }

  # Write-only, and only under the one prefix the artifact store uses.
  statement {
    sid       = "Screenshots"
    effect    = "Allow"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.artifacts.arn}/audits/*"]
  }

  statement {
    sid    = "Consume"
    effect = "Allow"
    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
    ]
    resources = [aws_sqs_queue.scan.arn]
  }

  # Only this function can read the AI keys.
  statement {
    sid       = "Secrets"
    effect    = "Allow"
    actions   = ["ssm:GetParameter", "ssm:GetParameters"]
    resources = ["arn:aws:ssm:${var.region}:${local.account_id}:parameter${local.ssm_prefix}/*"]
  }

  # Explicit rather than relying on the AWS-managed key's default policy, so the
  # grant is visible in one place and survives a tightened key policy.
  statement {
    sid       = "DecryptSecrets"
    effect    = "Allow"
    actions   = ["kms:Decrypt"]
    resources = [data.aws_kms_alias.ssm.target_key_arn]
  }
}

resource "aws_iam_role_policy" "scan" {
  name   = "${local.name_prefix}-scan"
  role   = aws_iam_role.scan.id
  policy = data.aws_iam_policy_document.scan.json
}

# --- pdf -------------------------------------------------------------------
# No write permission of any kind, and no access to the secret parameters: this
# function renders a report that already exists.
data "aws_iam_policy_document" "pdf" {
  statement {
    sid       = "Logs"
    effect    = "Allow"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.pdf.arn}:*"]
  }

  statement {
    sid       = "ReadRecords"
    effect    = "Allow"
    actions   = ["dynamodb:GetItem"]
    resources = [aws_dynamodb_table.audits.arn]
  }

  statement {
    sid       = "ReadBaseUrl"
    effect    = "Allow"
    actions   = ["ssm:GetParameter"]
    resources = ["arn:aws:ssm:${var.region}:${local.account_id}:parameter${local.ssm_prefix}/public-base-url"]
  }
}

resource "aws_iam_role_policy" "pdf" {
  name   = "${local.name_prefix}-pdf"
  role   = aws_iam_role.pdf.id
  policy = data.aws_iam_policy_document.pdf.json
}
