# This stack creates the bucket its own state now lives in — the usual
# chicken-and-egg. It was resolved the usual way: applied once against local
# state, then migrated here, so the state is no longer tied to whichever
# machine ran the first apply.
#
# Same conventions as `infra/backend.tf`: `use_lockfile` is the native S3
# lockfile from Terraform 1.11, so there is no DynamoDB lock table to create.
# The bucket name cannot be interpolated in a backend block, so it is passed at
# init time:
#   terraform init -backend-config="bucket=sitedoc-tfstate-<account_id>"
terraform {
  backend "s3" {
    key          = "bootstrap/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}
