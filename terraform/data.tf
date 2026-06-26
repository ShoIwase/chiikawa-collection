# bar504-infra で管理されているリソースをデータソースで参照する

data "aws_caller_identity" "current" {}

data "aws_route53_zone" "main" {
  name = var.domain_name
}

# CloudFront 用ワイルドカード証明書 (us-east-1 で発行済み)
data "aws_acm_certificate" "cloudfront" {
  provider    = aws.us_east_1
  domain      = var.domain_name
  statuses    = ["ISSUED"]
  most_recent = true
}

# 既存 Cognito ユーザープール
data "aws_cognito_user_pools" "main" {
  name = "TaskManager-prod"
}

# CloudFront マネージドキャッシュポリシー
data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}
