# Every access pattern in the app is "get this audit by id" or "overwrite this
# audit" — exactly a partition key. No GSI: nothing queries across audits, and one
# will be added when a real access pattern needs it.
#
# On-demand billing is genuinely $0 while idle, and 25 GB of storage is always
# free. RDS would bill per instance-hour and drag Lambda into VPC networking (ENI
# cold starts, NAT charges) for no benefit.
resource "aws_dynamodb_table" "audits" {
  name         = local.table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  # DynamoDB expires items itself, free. No cleanup Lambda to write, deploy,
  # monitor or pay for. The S3 lifecycle rule uses the same window so records and
  # screenshots disappear together.
  #
  # No point-in-time recovery: an accepted gap for a 30-day retention window (spec
  # §11), and non-negotiable if this ever holds customer data.
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }
}
