terraform {
  required_version = ">= 1.11.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Local state on purpose: this stack creates the bucket the other stack's state
  # lives in. Its own state is small, recreatable, and holds no secrets.
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

data "aws_caller_identity" "current" {}
