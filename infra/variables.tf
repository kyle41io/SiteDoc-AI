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

# 2 restores the per-function ceiling that replaced the old in-process
# `pdfsInFlight` counter. It had to sit at -1 ("no reservation") while this
# account was on the new-account concurrency quota of 10: Lambda refuses any
# reservation that would leave fewer than 10 unreserved, so on a limit of 10
# *every* positive value was rejected, not just a large one. The quota is now
# 1000 (granted 2026-08-06) and a reservation of 2 fits.
#
# This is also the only thing bounding Chromium now. The old 10 was an accidental
# spend ceiling — the account simply could not run more than 10 invocations at
# once. With that gone, the two deliberate caps are this value and
# `maximum_concurrency = 2` on the scan queue's event source mapping. Raising
# either one raises the worst-case bill, so raise them on purpose or not at all.
variable "pdf_reserved_concurrency" {
  description = "Reserved concurrency for the pdf function. -1 disables reservation."
  type        = number
  default     = 2

  validation {
    condition     = var.pdf_reserved_concurrency == -1 || var.pdf_reserved_concurrency >= 1
    error_message = "Use -1 for no reservation, or a positive value once the account quota exceeds 10 + this value."
  }
}
