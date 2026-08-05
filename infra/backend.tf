# `use_lockfile` is the native S3 lockfile from Terraform 1.11: it replaces the
# DynamoDB lock table older guides prescribe, so there is no extra resource to
# create, pay for or forget.
#
# The bucket name is not interpolatable here — backend blocks cannot use
# variables — so it is passed at init time:
#   terraform init -backend-config="bucket=sitedoc-tfstate-<account_id>"
terraform {
  backend "s3" {
    key          = "app/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}
