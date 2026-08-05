resource "aws_sqs_queue" "scan_dlq" {
  name                      = "${local.name_prefix}-scan-dlq"
  message_retention_seconds = 1209600 # 14 days, the maximum
}

# Visibility timeout must exceed the function timeout (300s) or SQS will hand the
# same job to a second worker while the first is still scanning.
resource "aws_sqs_queue" "scan" {
  name                       = "${local.name_prefix}-scan"
  visibility_timeout_seconds = 360

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.scan_dlq.arn
    maxReceiveCount     = 2
  })
}
