output "cloudfront_url" {
  value = "https://chiikawa.${var.domain_name}"
}

output "api_endpoint" {
  value = aws_apigatewayv2_api.chiikawa.api_endpoint
}

output "static_bucket" {
  value = aws_s3_bucket.chiikawa_static.bucket
}

output "cognito_client_id" {
  value = aws_cognito_user_pool_client.chiikawa.id
}
