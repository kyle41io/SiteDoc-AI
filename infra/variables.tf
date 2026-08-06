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

# -1 means "no reservation", and it has to stay that way on this account. The
# account's concurrent-execution quota is 10 (the new-account default; the usual
# figure is 1000), and Lambda refuses any reservation that would leave fewer than
# 10 unreserved — so on a limit of 10 *every* positive value is rejected, not just
# a large one. The 10 itself still bounds Chromium: the account cannot run more
# than 10 invocations at once no matter which function asks.
#
# After raising the quota in Service Quotas ("Concurrent executions"), set this to
# 2 to restore the per-function ceiling that replaced the old in-process
# `pdfsInFlight` counter.
variable "pdf_reserved_concurrency" {
  description = "Reserved concurrency for the pdf function. -1 disables reservation."
  type        = number
  default     = -1

  validation {
    condition     = var.pdf_reserved_concurrency == -1 || var.pdf_reserved_concurrency >= 1
    error_message = "Use -1 for no reservation, or a positive value once the account quota exceeds 10 + this value."
  }
}
