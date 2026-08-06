# The zip is built from esbuild output rather than committed: `npm run
# bundle:lambda` runs before `terraform apply`, in the pipeline and by hand.
# `source_code_hash` is what makes a code-only change redeploy the function.
data "archive_file" "api" {
  type        = "zip"
  source_file = "${path.module}/../dist-lambda/api/index.js"
  output_path = "${path.module}/.terraform/tmp/api.zip"
}

# A small zip on the managed runtime, deliberately: this is the request a user
# waits on, so it must cold-start in a couple of hundred milliseconds, and the
# Chromium image must never be in that path.
#
# 15s rather than something tighter because `validatePublicHttpUrl` resolves DNS
# for a user-supplied hostname, which is slow for a host that never resolves.
resource "aws_lambda_function" "api" {
  function_name = "${local.name_prefix}-api"
  role          = aws_iam_role.api.arn
  runtime       = "nodejs22.x"
  handler       = "index.handler"
  architectures = ["x86_64"]

  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256

  memory_size = 512
  timeout     = 15

  environment {
    variables = {
      AUDIT_STORE       = "dynamo"
      SITEDOC_TABLE     = aws_dynamodb_table.audits.name
      SITEDOC_DISPATCH  = "sqs"
      SITEDOC_QUEUE_URL = aws_sqs_queue.scan.url
      NODE_OPTIONS      = "--enable-source-maps"
    }
  }

  # Without this the first invocation creates its own group with infinite
  # retention, and Terraform's group sits empty.
  depends_on = [aws_cloudwatch_log_group.api]
}

# 2048 MB gives ~1.2 vCPU and 4x Render's RAM, which retires the OOM-restart
# problem and the SITEDOC_MAX_CONCURRENT_SCANS=1 cap. Lambda's always-free
# 400,000 GB-seconds covers roughly 8,000 scans/month at 25s each.
#
# `AWS_REGION` is deliberately absent: it is reserved and injected by the runtime,
# and setting it fails the update.
resource "aws_lambda_function" "scan" {
  function_name = "${local.name_prefix}-scan"
  role          = aws_iam_role.scan.arn
  package_type  = "Image"
  image_uri     = local.image_uri
  architectures = ["x86_64"]

  memory_size = 2048
  timeout     = 300

  image_config {
    command = ["scan.handler"]
  }

  environment {
    variables = {
      AUDIT_STORE             = "dynamo"
      SITEDOC_TABLE           = aws_dynamodb_table.audits.name
      SITEDOC_ARTIFACTS       = "s3"
      SITEDOC_ARTIFACT_BUCKET = aws_s3_bucket.artifacts.id
      SSM_PREFIX              = local.ssm_prefix
      SITEDOC_AXE_DIR         = "/var/task/node_modules/axe-core"

      # Playwright throws away the browser's stderr unless this is set, which
      # makes a Chromium crash unfalsifiable from the outside: the invocation
      # succeeds, the handler reports "Target page, context or browser has been
      # closed", and the reason Chromium gave is gone. Worth the handful of extra
      # log lines per audit for a worker whose whole job is driving a browser.
      # Set to "pw:browser,pw:protocol" if a CDP-level trace is ever needed.
      DEBUG = "pw:browser*"
    }
  }

  depends_on = [aws_cloudwatch_log_group.scan]
}

# batch_size 1: one audit per invocation, so a retry re-runs exactly one scan.
# maximum_concurrency 2 replaces the in-process concurrency cap.
# ReportBatchItemFailures is what makes the handler's return value meaningful —
# without it, one failed message redelivers its healthy neighbors too.
resource "aws_lambda_event_source_mapping" "scan" {
  event_source_arn = aws_sqs_queue.scan.arn
  function_name    = aws_lambda_function.scan.arn
  batch_size       = 1

  function_response_types = ["ReportBatchItemFailures"]

  scaling_config {
    maximum_concurrency = 2
  }
}

# Same image, different command — one image to build, push and pay ECR storage
# for. Reserved concurrency of 2 replaces the in-process `pdfsInFlight` counter: a
# public endpoint that launches Chromium needs a hard ceiling.
resource "aws_lambda_function" "pdf" {
  function_name = "${local.name_prefix}-pdf"
  role          = aws_iam_role.pdf.arn
  package_type  = "Image"
  image_uri     = local.image_uri
  architectures = ["x86_64"]

  memory_size                    = 2048
  timeout                        = 120
  reserved_concurrent_executions = var.pdf_reserved_concurrency

  image_config {
    command = ["pdf.handler"]
  }

  environment {
    variables = {
      AUDIT_STORE            = "dynamo"
      SITEDOC_TABLE          = aws_dynamodb_table.audits.name
      SITEDOC_BASE_URL_PARAM = "${local.ssm_prefix}/public-base-url"
    }
  }

  depends_on = [aws_cloudwatch_log_group.pdf]
}

# AWS_IAM, not NONE: the URLs must not be publicly invocable. CloudFront signs
# origin requests with SigV4 through OAC, which is the same trust mechanism the S3
# origins use. API Gateway is avoided because its 1M-request free tier expires
# after 12 months, while Function URLs have no per-request charge ever.
resource "aws_lambda_function_url" "api" {
  function_name      = aws_lambda_function.api.function_name
  authorization_type = "AWS_IAM"
}

resource "aws_lambda_function_url" "pdf" {
  function_name      = aws_lambda_function.pdf.function_name
  authorization_type = "AWS_IAM"
}

# OAC needs BOTH permissions, which is not obvious and fails silently-ish when
# half-done: with only `lambda:InvokeFunctionUrl`, every signed origin request is
# refused before the function runs, and because CloudFront maps origin 403s to
# /404.html the symptom is a plain 404 with no log line anywhere. The AWS docs for
# restricting a function URL to CloudFront list two separate `add-permission`
# calls for exactly this reason.
#
# Confirmed empirically: adding `lambda:InvokeFunction` turned a masked 404 into a
# real 400 from the handler.
resource "aws_lambda_permission" "api_from_cloudfront" {
  statement_id           = "AllowCloudFrontInvokeUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.api.function_name
  principal              = "cloudfront.amazonaws.com"
  source_arn             = aws_cloudfront_distribution.main.arn
  function_url_auth_type = "AWS_IAM"
}

resource "aws_lambda_permission" "api_invoke_from_cloudfront" {
  statement_id  = "AllowCloudFrontInvokeFunction"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "cloudfront.amazonaws.com"
  source_arn    = aws_cloudfront_distribution.main.arn
}

resource "aws_lambda_permission" "pdf_from_cloudfront" {
  statement_id           = "AllowCloudFrontInvokeUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.pdf.function_name
  principal              = "cloudfront.amazonaws.com"
  source_arn             = aws_cloudfront_distribution.main.arn
  function_url_auth_type = "AWS_IAM"
}

resource "aws_lambda_permission" "pdf_invoke_from_cloudfront" {
  statement_id  = "AllowCloudFrontInvokeFunction"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.pdf.function_name
  principal     = "cloudfront.amazonaws.com"
  source_arn    = aws_cloudfront_distribution.main.arn
}
