variable "region" {
  description = "Single region for the whole deployment."
  type        = string
  default     = "us-east-1"
}

variable "image_tag" {
  description = "Git SHA of the browser image already pushed to ECR."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-f]{7,40}$", var.image_tag))
    error_message = "image_tag must be a git SHA — a moving tag like 'latest' would make deploys unreproducible."
  }
}

variable "retention_days" {
  description = "How long audit records and screenshots live."
  type        = number
  default     = 30
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention. Never 'never' — that is a silent bill."
  type        = number
  default     = 14
}

variable "github_repo" {
  description = "owner/name, used only for tagging and documentation here."
  type        = string
  default     = "kyle41io/SiteDoc-AI"
}
