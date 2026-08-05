resource "aws_cloudfront_function" "rewrites" {
  name    = "${local.name_prefix}-rewrites"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = file("${path.module}/cloudfront-rewrites.js")
}

resource "aws_cloudfront_origin_access_control" "s3" {
  name                              = "${local.name_prefix}-s3"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Separate OAC for the Function URLs: the origin type differs, and SigV4 over a
# Lambda URL signs a different canonical request than over S3.
resource "aws_cloudfront_origin_access_control" "lambda" {
  name                              = "${local.name_prefix}-lambda"
  origin_access_control_origin_type = "lambda"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# AWS-managed policy ids, stable across accounts.
locals {
  cache_optimized     = "658327ea-f89d-4fab-a63d-7e88639e58f6" # CachingOptimized
  cache_disabled      = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # CachingDisabled
  origin_all_but_host = "b689b0a8-53d0-40ab-baf2-68738e2966ac" # AllViewerExceptHostHeader
}

resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  comment             = "SiteDoc AI"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  http_version        = "http2and3"

  # --- Origins -------------------------------------------------------------
  origin {
    origin_id                = "frontend"
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.s3.id
  }

  origin {
    origin_id                = "artifacts"
    domain_name              = aws_s3_bucket.artifacts.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.s3.id
  }

  origin {
    origin_id                = "api"
    domain_name              = replace(replace(aws_lambda_function_url.api.function_url, "https://", ""), "/", "")
    origin_access_control_id = aws_cloudfront_origin_access_control.lambda.id

    custom_origin_config {
      origin_protocol_policy = "https-only"
      http_port              = 80
      https_port             = 443
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  origin {
    origin_id                = "pdf"
    domain_name              = replace(replace(aws_lambda_function_url.pdf.function_url, "https://", ""), "/", "")
    origin_access_control_id = aws_cloudfront_origin_access_control.lambda.id

    custom_origin_config {
      origin_protocol_policy = "https-only"
      http_port              = 80
      https_port             = 443
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # --- Behaviors, most specific first --------------------------------------
  # `AllViewerExceptHostHeader` is mandatory on the Lambda origins: forwarding the
  # viewer Host header breaks the SigV4 signature, and the failure looks like a 403
  # from Lambda rather than a routing mistake.
  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = "api"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = local.cache_disabled
    origin_request_policy_id = local.origin_all_but_host
    compress                 = true
  }

  ordered_cache_behavior {
    path_pattern             = "/pdf/*"
    target_origin_id         = "pdf"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = local.cache_disabled
    origin_request_policy_id = local.origin_all_but_host
    compress                 = true
  }

  # Immutable PNGs, edge-cached, never touching compute.
  ordered_cache_behavior {
    path_pattern           = "/artifacts/*"
    target_origin_id       = "artifacts"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = local.cache_optimized
    compress               = true

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.rewrites.arn
    }
  }

  # `/report/*`, not `/report*`: the latter would also capture an unrelated path
  # such as /reporting. A bare `/report` with no id falls through to the default
  # behavior and resolves to the 404 page, which is correct — a report without an
  # id does not exist.
  ordered_cache_behavior {
    path_pattern           = "/report/*"
    target_origin_id       = "frontend"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = local.cache_optimized
    compress               = true

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.rewrites.arn
    }
  }

  default_cache_behavior {
    target_origin_id       = "frontend"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = local.cache_optimized
    compress               = true
  }

  # --- Errors --------------------------------------------------------------
  # Only 403 is mapped, deliberately. S3 with OAC returns 403 for a missing key
  # (there is no s3:ListBucket grant), so this covers unknown pages. 404 is left
  # alone because `GET /api/audits?id=` legitimately returns a JSON 404 for an
  # unknown audit, and custom error responses are distribution-wide — mapping 404
  # would replace that JSON body with an HTML page and break the client's
  # not-found handling.
  custom_error_response {
    error_code            = 403
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 10
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # The default *.cloudfront.net certificate. A custom domain would add a Route 53
  # hosted zone at $0.50/month — the only recurring line item in this design.
  viewer_certificate {
    cloudfront_default_certificate = true
  }
}
