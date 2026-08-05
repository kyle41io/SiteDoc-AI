# Standard parameters are free; Secrets Manager is $0.40 per secret per month and
# its differentiators (rotation, cross-account resource policies) are not needed
# here. With rotation as a requirement this decision reverses.
#
# The values are placeholders and Terraform is told to ignore them forever: state
# stores every managed attribute in plaintext, so a secret passed through a
# variable is a secret written to state. Real values are set out-of-band:
#   aws ssm put-parameter --name /sitedoc-ai/OPENAI_API_KEY --type SecureString \
#     --value "sk-..." --overwrite
resource "aws_ssm_parameter" "anthropic_key" {
  name  = "${local.ssm_prefix}/ANTHROPIC_API_KEY"
  type  = "SecureString"
  value = "placeholder-set-out-of-band"

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "openai_key" {
  name  = "${local.ssm_prefix}/OPENAI_API_KEY"
  type  = "SecureString"
  value = "placeholder-set-out-of-band"

  lifecycle {
    ignore_changes = [value]
  }
}

# The PDF renderer needs the public base URL to navigate, but the distribution
# depends on the PDF function's URL — so passing the domain as a Lambda
# environment variable is a dependency cycle. Terraform writes it here after the
# distribution exists and the function reads it at cold start; a runtime read is
# not a Terraform dependency, so the cycle disappears.
resource "aws_ssm_parameter" "public_base_url" {
  name  = "${local.ssm_prefix}/public-base-url"
  type  = "String"
  value = "https://${aws_cloudfront_distribution.main.domain_name}"
}
