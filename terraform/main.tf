# ---------------------------------------------------------------------------
# Cognito: 既存ユーザープールに App Client を追加
# ---------------------------------------------------------------------------
resource "aws_cognito_user_pool_client" "chiikawa" {
  name         = "ChiikawaClient"
  user_pool_id = tolist(data.aws_cognito_user_pools.main.ids)[0]

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  prevent_user_existence_errors = "ENABLED"
  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }
  access_token_validity  = 1
  id_token_validity      = 1
  refresh_token_validity = 30
}

# ---------------------------------------------------------------------------
# S3: 静的サイト (CloudFront OAC 専用)
# ---------------------------------------------------------------------------
resource "aws_s3_bucket" "chiikawa_static" {
  bucket = "chiikawa-static-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_public_access_block" "chiikawa_static" {
  bucket                  = aws_s3_bucket.chiikawa_static.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "chiikawa_static" {
  bucket = aws_s3_bucket.chiikawa_static.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_policy" "chiikawa_static" {
  bucket = aws_s3_bucket.chiikawa_static.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "AllowCloudFrontOAC"
      Effect = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action   = "s3:GetObject"
      Resource = "${aws_s3_bucket.chiikawa_static.arn}/*"
      Condition = {
        StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.chiikawa.arn }
      }
    }]
  })
  depends_on = [aws_s3_bucket_public_access_block.chiikawa_static]
}

# ---------------------------------------------------------------------------
# S3: スクレイプ画像保存用
# ---------------------------------------------------------------------------
resource "aws_s3_bucket" "chiikawa_images" {
  bucket = "chiikawa-images-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_public_access_block" "chiikawa_images" {
  bucket                  = aws_s3_bucket.chiikawa_images.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "chiikawa_images" {
  bucket = aws_s3_bucket.chiikawa_images.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "AllowCloudFrontOAC"
      Effect = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action   = "s3:GetObject"
      Resource = "${aws_s3_bucket.chiikawa_images.arn}/*"
      Condition = {
        StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.chiikawa.arn }
      }
    }]
  })
  depends_on = [aws_s3_bucket_public_access_block.chiikawa_images]
}

# ---------------------------------------------------------------------------
# CloudFront Response Headers Policy (セキュリティヘッダー)
# ---------------------------------------------------------------------------
resource "aws_cloudfront_response_headers_policy" "chiikawa_security" {
  name = "chiikawa-security-headers"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 63072000 # 2年
      include_subdomains         = true
      preload                    = true
      override                   = true
    }
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
    xss_protection {
      mode_block = true
      protection = true
      override   = true
    }
    content_security_policy {
      content_security_policy = join("; ", [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "connect-src 'self' https://cognito-idp.ap-northeast-1.amazonaws.com https://*.execute-api.ap-northeast-1.amazonaws.com",
        "font-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ])
      override = true
    }
  }

  custom_headers_config {
    items {
      header   = "Permissions-Policy"
      value    = "camera=(), microphone=(), geolocation=(), payment=()"
      override = true
    }
    items {
      header   = "Cache-Control"
      value    = "no-store"
      override = false # キャッシュポリシーを優先、HTMLのみ上書き
    }
  }
}

# ---------------------------------------------------------------------------
# CloudFront OAC + Distribution
# ---------------------------------------------------------------------------
resource "aws_cloudfront_origin_access_control" "chiikawa" {
  name                              = "chiikawa-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "chiikawa" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  aliases             = ["chiikawa.${var.domain_name}"]
  price_class         = "PriceClass_200"

  origin {
    origin_id                = "chiikawa-static"
    domain_name              = aws_s3_bucket.chiikawa_static.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.chiikawa.id
  }

  origin {
    origin_id                = "chiikawa-images"
    domain_name              = aws_s3_bucket.chiikawa_images.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.chiikawa.id
  }

  default_cache_behavior {
    target_origin_id            = "chiikawa-static"
    viewer_protocol_policy      = "redirect-to-https"
    allowed_methods             = ["GET", "HEAD", "OPTIONS"]
    cached_methods              = ["GET", "HEAD"]
    compress                    = true
    cache_policy_id             = data.aws_cloudfront_cache_policy.caching_optimized.id
    response_headers_policy_id  = aws_cloudfront_response_headers_policy.chiikawa_security.id
  }

  ordered_cache_behavior {
    path_pattern                = "/images/*"
    target_origin_id            = "chiikawa-images"
    viewer_protocol_policy      = "redirect-to-https"
    allowed_methods             = ["GET", "HEAD"]
    cached_methods              = ["GET", "HEAD"]
    compress                    = true
    cache_policy_id             = data.aws_cloudfront_cache_policy.caching_optimized.id
    response_headers_policy_id  = aws_cloudfront_response_headers_policy.chiikawa_security.id
  }

  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  viewer_certificate {
    acm_certificate_arn      = data.aws_acm_certificate.cloudfront.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }
}

# ---------------------------------------------------------------------------
# Route 53
# ---------------------------------------------------------------------------
resource "aws_route53_record" "chiikawa" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "chiikawa.${var.domain_name}"
  type    = "A"
  alias {
    name                   = aws_cloudfront_distribution.chiikawa.domain_name
    zone_id                = aws_cloudfront_distribution.chiikawa.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "chiikawa_aaaa" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "chiikawa.${var.domain_name}"
  type    = "AAAA"
  alias {
    name                   = aws_cloudfront_distribution.chiikawa.domain_name
    zone_id                = aws_cloudfront_distribution.chiikawa.hosted_zone_id
    evaluate_target_health = false
  }
}

# ---------------------------------------------------------------------------
# DynamoDB
# ---------------------------------------------------------------------------
resource "aws_dynamodb_table" "chiikawa_master" {
  name         = "ChiikawaMaster"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "Category"
  range_key    = "ItemName"

  attribute {
    name = "Category"
    type = "S"
  }
  attribute {
    name = "ItemName"
    type = "S"
  }

  point_in_time_recovery { enabled = true }
}

resource "aws_dynamodb_table" "user_collection" {
  name         = "UserCollection"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "FamilyID"
  range_key    = "ItemName"

  attribute {
    name = "FamilyID"
    type = "S"
  }
  attribute {
    name = "ItemName"
    type = "S"
  }

  point_in_time_recovery { enabled = true }
}

# ---------------------------------------------------------------------------
# SSM Parameter Store
# Lambda/API GW は SAM (CloudFormation) が管理するため /chiikawa/api-url は SAM 側で書き込む
# ---------------------------------------------------------------------------
resource "aws_ssm_parameter" "chiikawa_cognito_user_pool_id" {
  name  = "/chiikawa/cognito-user-pool-id"
  type  = "String"
  value = tolist(data.aws_cognito_user_pools.main.ids)[0]
}

resource "aws_ssm_parameter" "chiikawa_cognito_client_id" {
  name  = "/chiikawa/cognito-client-id"
  type  = "String"
  value = aws_cognito_user_pool_client.chiikawa.id
}

resource "aws_ssm_parameter" "chiikawa_cloudfront_url" {
  name  = "/chiikawa/cloudfront-url"
  type  = "String"
  value = "https://chiikawa.${var.domain_name}"
}

resource "aws_ssm_parameter" "chiikawa_cloudfront_distribution_id" {
  name  = "/chiikawa/cloudfront-distribution-id"
  type  = "String"
  value = aws_cloudfront_distribution.chiikawa.id
}

resource "aws_ssm_parameter" "chiikawa_static_bucket" {
  name  = "/chiikawa/static-bucket"
  type  = "String"
  value = aws_s3_bucket.chiikawa_static.bucket
}
