terraform {
  required_version = ">= 1.11.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Backend lives in backend.tf.
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "sitedoc-ai"
      ManagedBy = "terraform"
      Stack     = "bootstrap"
    }
  }
}

variable "region" {
  description = "Single region for the whole deployment."
  type        = string
  default     = "us-east-1"
}

variable "github_repo" {
  description = "owner/name of the repository allowed to assume the deploy role."
  type        = string
  default     = "kyle41io/SiteDoc-AI"
}

# Deliberately not "production". GitHub matches environment names
# case-insensitively, and the Vercel integration already owns an environment
# called `Production` — so `environment: production` in a workflow silently
# attaches to Vercel's, which has no reviewers, and the approval gate never
# fires. It also breaks the trust policy below: the `sub` claim would carry
# `:environment:Production` while IAM's StringEquals is case-sensitive. A
# dedicated name owned by this stack avoids both.
variable "deploy_environment" {
  description = "GitHub environment whose approval gates AWS deploys. Must match aws-deploy.yml."
  type        = string
  default     = "aws-production"
}

data "aws_caller_identity" "current" {}
